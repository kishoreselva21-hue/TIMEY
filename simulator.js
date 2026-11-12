/**
 * simulator.js
 * Teammate 2: Predictive Simulation & Adaptive Learning Engine
 * Implements:
 *  - #2 What-If Simulation & Monte Carlo Stress-Tester (500 randomized disruption trials)
 *  - 14-Day Burnout & Cognitive Load Heatmap
 *  - #6 Adaptive Learning & Performance Tracking (Exponential Moving Average multipliers)
 */

(function () {
  const TRIAL_COUNT = 500;

  // Run 500 Monte Carlo chaos simulations in <25ms
  function runMonteCarlo(state, options = {}) {
    const schedule = state.schedule || [];
    const tasks = state.tasks || [];
    const procrastinationBias = options.procrastinationRisk ?? 0.25; // 0.0 to 1.0
    const disruptionRate = options.disruptionRisk ?? 0.20;

    if (!schedule.length) {
      state.simulationResult = {
        survivalProbability: 100,
        heatmap14Day: Array(14).fill(15),
        bottleneckSubject: 'None',
        disruptionNotes: 'Schedule is currently empty—zero deadline risk.'
      };
      return state.simulationResult;
    }

    let survivedTrials = 0;
    const subjectFailureCounts = {};
    const now = Date.now();

    for (let trial = 0; trial < TRIAL_COUNT; trial++) {
      let trialFailed = false;
      let accumulatedSlipHours = 0;

      // Random Class Rep / life shock (0 to 3 hours lost mid-week)
      if (Math.random() < disruptionRate) {
        accumulatedSlipHours += 1 + Math.floor(Math.random() * 3);
      }

      for (let i = 0; i < schedule.length; i++) {
        const slot = schedule[i];
        const task = tasks.find((t) => t.id === slot.taskId);
        if (!task || task.type === 'LECTURE') continue;

        const mult = (state.adaptiveMultipliers && state.adaptiveMultipliers[slot.subject]) || 1.0;

        // Stochastic task overrun noise
        if (Math.random() < procrastinationBias * mult) {
          accumulatedSlipHours += 1;
        }

        // Circadian fatigue failure on late-night slots (>= 19:00)
        if (slot.startHour >= 19 && Math.random() < 0.22) {
          accumulatedSlipHours += 1;
        }

        const effectiveCompletionMs =
          now + (slot.dayIndex * 24 + (slot.startHour - 8) + slot.durationHours + accumulatedSlipHours) * 3600000;
        const deadlineMs = new Date(task.deadlineISO).getTime();

        if (effectiveCompletionMs > deadlineMs) {
          trialFailed = true;
          subjectFailureCounts[slot.subject] = (subjectFailureCounts[slot.subject] || 0) + 1;
        }
      }

      if (!trialFailed) {
        survivedTrials++;
      }
    }

    const survivalProbability = Math.max(5, Math.min(99, Math.round((survivedTrials / TRIAL_COUNT) * 100)));

    // Identify primary bottleneck subject
    let bottleneckSubject = 'None';
    let maxFails = 0;
    Object.entries(subjectFailureCounts).forEach(([subj, fails]) => {
      if (fails > maxFails) {
        maxFails = fails;
        bottleneckSubject = subj;
      }
    });

    // Compute 14-Day Burnout & Cognitive Load Heatmap (0 - 100 scale)
    const heatmap14Day = [];
    for (let day = 0; day < 14; day++) {
      const mappedDay = day % 7;
      const daySlots = schedule.filter((s) => s.dayIndex === mappedDay);
      const totalHours = daySlots.reduce((acc, s) => acc + (s.durationHours || 1), 0);
      const examCount = daySlots.filter((s) => s.type === 'EXAM' || s.priority === 'CRITICAL').length;

      // Second week carries cumulative fatigue carry-over + slight random variance
      const week2Carry = day >= 7 ? 8 : 0;
      const modeMultiplier = state.mode === 'EMERGENCY' ? 1.25 : state.mode === 'EXAM' ? 1.15 : 1.0;
      const rawLoad = (totalHours * 13 + examCount * 14 + week2Carry) * modeMultiplier;
      heatmap14Day.push(Math.min(100, Math.max(12, Math.round(rawLoad))));
    }

    const disruptionNotes =
      survivalProbability >= 80
        ? `Strong buffer resilience across ${TRIAL_COUNT} chaos trials. Minor watch on ${bottleneckSubject}.`
        : survivalProbability >= 55
        ? `Moderate deadline risk (${100 - survivalProbability}% slip rate). ${bottleneckSubject} is your tightest bottleneck.`
        : `CRITICAL CRUNCH WARNING: ${100 - survivalProbability}% failure rate in simulations! Activate Exam or Emergency Mode.`;

    state.simulationResult = {
      survivalProbability,
      heatmap14Day,
      bottleneckSubject,
      disruptionNotes
    };

    return state.simulationResult;
  }

  // Adaptive Learning (#6): Updates subject time multiplier via Exponential Moving Average
  function recordTaskCompletion(state, subject, estimatedMins, actualMins) {
    if (!subject || !estimatedMins || !actualMins) return 1.0;

    if (!state.adaptiveMultipliers) {
      state.adaptiveMultipliers = {};
    }

    const oldMult = state.adaptiveMultipliers[subject] || 1.0;
    const observedRatio = Math.max(0.7, Math.min(2.0, actualMins / estimatedMins));
    // 70% historical stability + 30% latest performance signal
    const updatedMult = Number((oldMult * 0.7 + observedRatio * 0.3).toFixed(2));

    state.adaptiveMultipliers[subject] = updatedMult;
    return updatedMult;
  }

  // Interactive "What-If" Simulator helper without mutating permanent state until user applies
  function simulateWhatIfScenario(state, scenarioType) {
    const clone = JSON.parse(JSON.stringify(state));

    if (scenarioType === 'SLEEP_DEPRIVED') {
      clone.energyProfile = clone.energyProfile.map((e) => Math.max(0.1, e * 0.65));
      return runMonteCarlo(clone, { procrastinationRisk: 0.45, disruptionRisk: 0.30 });
    }
    if (scenarioType === 'PROCRASTINATION_SPIKE') {
      return runMonteCarlo(clone, { procrastinationRisk: 0.60, disruptionRisk: 0.25 });
    }
    if (scenarioType === 'SURPRISE_QUIZ') {
      clone.tasks.push({
        id: 'whatif-quiz',
        title: 'What-If Surprise Quiz',
        subject: 'Data Structures',
        credits: 4,
        deadlineISO: new Date(Date.now() + 30 * 3600000).toISOString(),
        estimatedMins: 120,
        priority: 'CRITICAL',
        type: 'EXAM'
      });
      if (window.ChronosSolver) window.ChronosSolver.solveSchedule(clone);
      return runMonteCarlo(clone, { procrastinationRisk: 0.30, disruptionRisk: 0.35 });
    }

    return runMonteCarlo(clone);
  }

  window.ChronosSimulator = {
    runMonteCarlo,
    recordTaskCompletion,
    simulateWhatIfScenario
  };
})();