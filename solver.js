/**
 * solver.js
 * Teammate 2: Mathematical Core & Deterministic Constraint-Satisfaction Engine
 * Implements:
 *  - #1 Multi-Objective Optimization (Deadline decay, Credit weightage, Circadian energy, Context-switch penalty)
 *  - #5 Automatic Ripple-Effect Rescheduler around locked slots
 *  - #7 Exam Preparation Mode (spaced-repetition injection + peak energy alignment)
 *  - #8 Emergency Mode (drops <3 credit tasks, compresses buffers, packs 48h crunch)
 */

(function () {
  const DAYS = 7;
  const START_HOUR = 8; // 8:00 AM
  const END_HOUR = 21;  // 9:00 PM (last slot starts at 20:00)

  // Mode-dependent objective weights
  function getObjectiveWeights(mode) {
    if (mode === 'EXAM') {
      return {
        deadline: 3.8,
        credits: 3.0,
        circadian: 3.2,
        contextSwitch: 2.0
      };
    }
    if (mode === 'EMERGENCY') {
      return {
        deadline: 5.0,
        credits: 4.0,
        circadian: 1.0, // In emergencies, raw survival beats circadian comfort
        contextSwitch: 0.5
      };
    }
    // STANDARD
    return {
      deadline: 2.5,
      credits: 2.2,
      circadian: 2.5,
      contextSwitch: 1.8
    };
  }

  // Compute effective duration in 1-hour blocks applying Adaptive Learning Multipliers (#6)
  function getEffectiveHours(task, state) {
    if (task.type === 'LECTURE' || task.type === 'EXAM' || task.fixedHour !== undefined) {
      return Math.max(1, Math.round((task.estimatedMins || 60) / 60));
    }
    const mult = (state.adaptiveMultipliers && state.adaptiveMultipliers[task.subject]) || 1.0;
    const rawHours = ((task.estimatedMins || 60) * mult) / 60;
    return Math.max(1, Math.min(4, Math.round(rawHours)));
  }

  // Expand task list dynamically for Exam Mode (injects spaced-repetition review blocks)
  // or filter tasks for Emergency Mode (drops low-credit, non-urgent tasks)
  function prepareTasksForMode(tasks, mode) {
    const now = Date.now();

    if (mode === 'EMERGENCY') {
      return tasks.filter((t) => {
        if (t.type === 'LECTURE' || t.type === 'EXAM' || t.isClassRepEvent) return true;
        const hoursLeft = (new Date(t.deadlineISO).getTime() - now) / 3600000;
        // Drop low-credit tasks whose deadlines are beyond 48 hours
        if ((t.credits || 3) < 3 && hoursLeft > 48) return false;
        return hoursLeft <= 72 || t.priority === 'CRITICAL';
      });
    }

    if (mode === 'EXAM') {
      const expanded = [...tasks];
      // For every EXAM or CRITICAL study task, inject a 1-hour spaced-repetition recall slot
      tasks.forEach((t) => {
        if (t.type === 'EXAM' || t.priority === 'CRITICAL') {
          const srId = `${t.id}-sr`;
          if (!expanded.some((x) => x.id === srId)) {
            expanded.push({
              id: srId,
              title: `Spaced Recall: ${t.subject}`,
              subject: t.subject,
              credits: t.credits || 4,
              deadlineISO: t.deadlineISO,
              estimatedMins: 60,
              priority: 'HIGH',
              type: 'REVIEW',
              parentTaskId: t.id
            });
          }
        }
      });
      return expanded;
    }

    return [...tasks];
  }

  // Score placing a task at (dayIndex, hour) across `durationHours`
  function scoreCandidateSlot(task, dayIndex, startHour, durationHours, grid, state, weights) {
    const now = Date.now();
    const slotTimestamp = now + (dayIndex * 24 + (startHour - START_HOUR)) * 3600000;
    const deadlineMs = new Date(task.deadlineISO).getTime();

    // Hard deadline violation check
    if (slotTimestamp > deadlineMs && task.type !== 'LECTURE') {
      return -10000;
    }

    // 1. Deadline Decay Urgency (closer deadlines score higher when scheduled earlier)
    const hoursUntilDeadline = Math.max(1, (deadlineMs - slotTimestamp) / 3600000);
    const urgencyScore = (100 / Math.sqrt(hoursUntilDeadline)) * (1 - dayIndex * 0.08);

    // 2. Credit Weightage & Priority Multiplier
    const priorityBoost =
      task.priority === 'CRITICAL' ? 1.6 : task.priority === 'HIGH' ? 1.25 : task.priority === 'MEDIUM' ? 1.0 : 0.75;
    const creditScore = (task.credits || 3) * 12 * priorityBoost;

    // 3. Circadian Energy Alignment (high-cognitive tasks matched to peak energy hours)
    let energySum = 0;
    for (let h = 0; h < durationHours; h++) {
      energySum += state.energyProfile[startHour + h] ?? 0.5;
    }
    const avgEnergy = energySum / durationHours;
    const cognitiveDemand = task.type === 'EXAM' || task.credits >= 4 ? 1.0 : 0.7;
    const circadianScore = avgEnergy * cognitiveDemand * 45;

    // 4. Context-Switching Penalty (penalize jumping between different subjects back-to-back)
    let contextPenalty = 0;
    const prevSlot = startHour > START_HOUR ? grid[dayIndex][startHour - 1] : null;
    const nextSlot = startHour + durationHours < END_HOUR ? grid[dayIndex][startHour + durationHours] : null;

    if (prevSlot && prevSlot.subject !== task.subject) {
      contextPenalty += 12;
    } else if (prevSlot && prevSlot.subject === task.subject) {
      contextPenalty -= 6; // Bonus for deep-work subject continuity
    }
    if (nextSlot && nextSlot.subject !== task.subject) {
      contextPenalty += 8;
    }

    // In STANDARD mode, preserve a 1-hour breather after 2+ consecutive study hours
    if (state.mode === 'STANDARD' && prevSlot && prevSlot.type === 'STUDY' && task.type === 'STUDY') {
      contextPenalty += 10;
    }

    return (
      weights.deadline * urgencyScore +
      weights.credits * creditScore +
      weights.circadian * circadianScore -
      weights.contextSwitch * contextPenalty
    );
  }

  // Main Constraint-Satisfaction & Ripple-Effect Auto-Rescheduler
  function solveSchedule(state) {
    const mode = state.mode || 'STANDARD';
    const weights = getObjectiveWeights(mode);
    const activeTasks = prepareTasksForMode(state.tasks || [], mode);

    // 2D occupancy grid: grid[dayIndex][hour] = slotObj | null
    const grid = Array.from({ length: DAYS }, () => Array(24).fill(null));
    const finalSlots = [];
    const placedTaskIds = new Set();

    // PASS 1: Lock user-pinned slots (#10 Manual Schedule Locking)
    const existingLocked = (state.schedule || []).filter((s) => s.isLocked);
    existingLocked.forEach((lockedSlot) => {
      // Ensure the underlying task still exists (wasn't cancelled by Class Rep)
      const taskExists = activeTasks.some((t) => t.id === lockedSlot.taskId);
      if (!taskExists) return;

      const d = lockedSlot.dayIndex;
      const start = lockedSlot.startHour;
      const dur = lockedSlot.durationHours || 1;

      let canPlace = true;
      for (let h = 0; h < dur; h++) {
        if (start + h >= END_HOUR || grid[d][start + h] !== null) canPlace = false;
      }

      if (canPlace) {
        for (let h = 0; h < dur; h++) {
          grid[d][start + h] = lockedSlot;
        }
        finalSlots.push({ ...lockedSlot });
        placedTaskIds.add(lockedSlot.taskId);
      }
    });

    // PASS 2: Place fixed hard constraints (Lectures & Class Rep Surprise Quizzes)
    activeTasks.forEach((task) => {
      if (placedTaskIds.has(task.id)) return;
      if (task.fixedDay !== undefined && task.fixedHour !== undefined) {
        const d = Math.max(0, Math.min(DAYS - 1, task.fixedDay));
        const start = Math.max(START_HOUR, Math.min(END_HOUR - 1, task.fixedHour));
        const dur = getEffectiveHours(task, state);

        // If a locked user slot collides with a Class Rep event, Class Rep event overrides it
        for (let h = 0; h < dur; h++) {
          if (start + h < END_HOUR) {
            const occupant = grid[d][start + h];
            if (occupant && occupant.isLocked) {
              // Unpin collided slot so it ripples elsewhere
              const idx = finalSlots.findIndex((s) => s.slotId === occupant.slotId);
              if (idx !== -1) {
                placedTaskIds.delete(occupant.taskId);
                finalSlots.splice(idx, 1);
              }
            }
          }
        }

        const slotObj = {
          slotId: 'slot-' + task.id,
          dayIndex: d,
          startHour: start,
          durationHours: dur,
          taskId: task.id,
          title: task.title,
          subject: task.subject,
          type: task.type,
          credits: task.credits || 3,
          priority: task.priority || 'HIGH',
          isLocked: Boolean(task.isClassRepEvent),
          isClassRepEvent: Boolean(task.isClassRepEvent)
        };

        for (let h = 0; h < dur; h++) {
          if (start + h < END_HOUR) grid[d][start + h] = slotObj;
        }
        finalSlots.push(slotObj);
        placedTaskIds.add(task.id);
      }
    });

    // PASS 3: Sort remaining flexible tasks by Urgency x Credit Weightage
    const flexibleTasks = activeTasks
      .filter((t) => !placedTaskIds.has(t.id))
      .sort((a, b) => {
        const urgA = new Date(a.deadlineISO).getTime() - (a.credits || 3) * 3600000;
        const urgB = new Date(b.deadlineISO).getTime() - (b.credits || 3) * 3600000;
        return urgA - urgB;
      });

    // Greedy Multi-Objective Placement with Ripple Fallback
    const maxDayLimit = mode === 'EMERGENCY' ? 2 : DAYS; // Emergency packs into next 48 hours first

    flexibleTasks.forEach((task) => {
      const dur = getEffectiveHours(task, state);
      let bestCandidate = null;
      let bestScore = -Infinity;

      for (let d = 0; d < DAYS; d++) {
        if (mode === 'EMERGENCY' && d >= maxDayLimit && bestCandidate !== null) break;

        for (let start = START_HOUR; start <= END_HOUR - dur; start++) {
          let free = true;
          for (let h = 0; h < dur; h++) {
            if (grid[d][start + h] !== null) {
              free = false;
              break;
            }
          }
          if (!free) continue;

          const score = scoreCandidateSlot(task, d, start, dur, grid, state, weights);
          if (score > bestScore) {
            bestScore = score;
            bestCandidate = { dayIndex: d, startHour: start };
          }
        }
      }

      // If no contiguous multi-hour block fits, split into 1-hour atomic fallback
      if (!bestCandidate && dur > 1) {
        for (let d = 0; d < DAYS; d++) {
          for (let start = START_HOUR; start < END_HOUR; start++) {
            if (grid[d][start] === null) {
              bestCandidate = { dayIndex: d, startHour: start, forcedDuration: 1 };
              break;
            }
          }
          if (bestCandidate) break;
        }
      }

      if (bestCandidate) {
        const actualDur = bestCandidate.forcedDuration || dur;
        const slotObj = {
          slotId: 'slot-' + task.id,
          dayIndex: bestCandidate.dayIndex,
          startHour: bestCandidate.startHour,
          durationHours: actualDur,
          taskId: task.id,
          title: task.title,
          subject: task.subject,
          type: task.type,
          credits: task.credits || 3,
          priority: task.priority || 'MEDIUM',
          isLocked: false,
          isClassRepEvent: false
        };

        for (let h = 0; h < actualDur; h++) {
          grid[bestCandidate.dayIndex][bestCandidate.startHour + h] = slotObj;
        }
        finalSlots.push(slotObj);
        placedTaskIds.add(task.id);
      }
    });

    // Sort chronologically for clean rendering
    finalSlots.sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour);
    state.schedule = finalSlots;
    return finalSlots;
  }

  window.ChronosSolver = {
    solveSchedule,
    getEffectiveHours
  };
})();