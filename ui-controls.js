/**
 * ui-controls.js
 * Clean Interface Controller, Auth Flow, Course/Exam Setup & Live Alerts
 */

(function () {
  const DAY_LABELS = ['Today', 'Tomorrow', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
  const VISIBLE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  function showToast(message, variant = 'INFO') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const styles = {
      INFO: 'bg-slate-900 border-indigo-500/50 text-slate-100',
      SUCCESS: 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100',
      WARNING: 'bg-amber-950/95 border-amber-500/60 text-amber-100',
      DANGER: 'bg-rose-950/95 border-rose-500/70 text-rose-100'
    };
    const icons = { INFO: '⚡', SUCCESS: '✅', WARNING: '⚠️', DANGER: '🚨' };

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto border rounded-xl px-4 py-3 shadow-2xl text-xs font-medium flex items-start gap-2.5 transition-all duration-300 ${
      styles[variant] || styles.INFO
    }`;
    toast.innerHTML = `<span class="text-base leading-none">${icons[variant] || '⚡'}</span><div class="flex-1 leading-relaxed">${message}</div>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  async function reoptimizeAndSync(meta = {}) {
    const state = window.AppState;
    const before = JSON.parse(JSON.stringify(state.schedule || []));
    window.ChronosSolver.solveSchedule(state);
    window.ChronosSimulator.runMonteCarlo(state);
    await window.GeminiBrain.explainScheduleDiff(before, state.schedule, state.mode);
    window.LiveSync.commit(meta);
  }

  async function toggleSlotLock(slotId) {
    const target = window.AppState.schedule.find((s) => s.slotId === slotId);
    if (!target) return;
    target.isLocked = !target.isLocked;
    showToast(
      target.isLocked
        ? `Pinned "${target.title}" at ${DAY_LABELS[target.dayIndex]} ${target.startHour}:00.`
        : `Unpinned "${target.title}".`,
      target.isLocked ? 'WARNING' : 'INFO'
    );
    await reoptimizeAndSync({ role: 'STUDENT', type: 'LOCK_TOGGLE' });
  }

  async function logTaskFinished(subject, estimatedMins, factor) {
    const actualMins = Math.round(estimatedMins * factor);
    const newMult = window.ChronosSimulator.recordTaskCompletion(window.AppState, subject, estimatedMins, actualMins);
    showToast(`Pace updated for ${subject}: ${newMult}x multiplier applied.`, 'SUCCESS');
    await reoptimizeAndSync({ role: 'STUDENT', type: 'ADAPTIVE_UPDATE' });
  }

  async function deleteConfiguredTask(taskId) {
    window.LiveSync.removeTask(taskId);
    showToast('Removed item and re-optimized timetable.', 'INFO');
    await reoptimizeAndSync({ role: 'STUDENT', type: 'TASK_REMOVED' });
  }

  function switchView(viewName) {
    ['timetable', 'setup', 'analytics', 'rep'].forEach((v) => {
      document.getElementById(`view-${v}`)?.classList.toggle('hidden', v !== viewName);
    });
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const active = btn.getAttribute('data-view') === viewName;
      btn.className = active
        ? 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white transition cursor-pointer'
        : 'nav-btn w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/70 transition cursor-pointer';
    });
  }

  // Enter Main App after Auth
  async function enterWorkspace(user) {
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('app-shell')?.classList.remove('hidden');

    document.getElementById('user-display-name').textContent = user.name;
    document.getElementById('user-display-meta').textContent = `${
      user.role === 'CLASS_REP' ? 'Class Rep' : 'Student'
    } • ${user.semester}`;

    window.LiveSync.reloadUserSession();

    // If user is a Class Rep, open directly on Class Rep Console
    if (user.role === 'CLASS_REP') {
      switchView('rep');
    } else {
      switchView('timetable');
    }
  }

  function showAuthScreen() {
    document.getElementById('app-shell')?.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
  }

  function renderTimetableGrid(state) {
    const container = document.getElementById('timetable-grid');
    if (!container) return;

    const schedule = state.schedule || [];
    const occupiedMap = {};
    schedule.forEach((slot) => {
      for (let h = 0; h < slot.durationHours; h++) {
        occupiedMap[`${slot.dayIndex}-${slot.startHour + h}`] = { slot, isStart: h === 0 };
      }
    });

    let html = `<div class="grid grid-cols-8 border-t border-l border-slate-800 rounded-xl overflow-hidden">`;
    html += `<div class="bg-slate-950 p-2 text-[11px] font-bold text-slate-400 border-r border-b border-slate-800">Time</div>`;
    DAY_LABELS.forEach((day, idx) => {
      const cls = idx === 0 ? 'text-indigo-300 bg-indigo-950/30' : 'text-slate-300 bg-slate-950';
      html += `<div class="${cls} p-2 text-xs font-bold text-center border-r border-b border-slate-800">${day}</div>`;
    });

    VISIBLE_HOURS.forEach((hour) => {
      html += `<div class="bg-slate-950/60 px-2 py-2.5 text-[11px] text-slate-400 font-mono border-r border-b border-slate-800 flex items-center">
        ${String(hour).padStart(2, '0')}:00
      </div>`;

      for (let d = 0; d < 7; d++) {
        const cell = occupiedMap[`${d}-${hour}`];
        if (!cell) {
          html += `<div class="bg-slate-900/25 border-r border-b border-slate-800/70 p-1 min-h-[50px]"></div>`;
        } else if (!cell.isStart) {
          const contColor = cell.slot.isLocked
            ? 'bg-amber-500/15 border-amber-500/40'
            : cell.slot.type === 'EXAM'
            ? 'bg-rose-500/15 border-rose-500/40'
            : cell.slot.type === 'LECTURE'
            ? 'bg-sky-500/15 border-sky-500/40'
            : 'bg-indigo-500/15 border-indigo-500/40';
          html += `<div class="${contColor} border-r border-b px-2 py-1 text-[10px] text-slate-400 italic flex items-center">↳ ${cell.slot.subject}</div>`;
        } else {
          const s = cell.slot;
          const cardStyle = s.isLocked
            ? 'bg-amber-500/20 border-amber-400/70 text-amber-100'
            : s.type === 'EXAM'
            ? 'bg-rose-500/20 border-rose-400/70 text-rose-100'
            : s.type === 'LECTURE'
            ? 'bg-sky-500/20 border-sky-400/60 text-sky-100'
            : 'bg-indigo-500/20 border-indigo-400/60 text-indigo-100';

          html += `
            <div class="${cardStyle} border-r border-b p-1.5 min-h-[50px] flex flex-col justify-between">
              <div class="flex items-start justify-between gap-1">
                <span class="text-[11px] font-bold leading-tight">${s.title}</span>
                <button
                  onclick="window.TimeyUI.toggleSlotLock('${s.slotId}')"
                  title="${s.isLocked ? 'Unpin block' : 'Pin block'}"
                  class="shrink-0 text-[11px] px-1 rounded ${
                    s.isLocked ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-950/60 text-slate-300'
                  } cursor-pointer"
                >${s.isLocked ? '📌' : '📍'}</button>
              </div>
              <div class="flex items-center justify-between mt-1 text-[10px] opacity-85">
                <span>${s.durationHours}h • ${s.subject}</span>
                ${
                  s.type === 'STUDY' || s.type === 'REVIEW'
                    ? `<button onclick="window.TimeyUI.logTaskFinished('${s.subject}', ${s.durationHours * 60}, 1.3)" class="underline hover:text-white cursor-pointer">+30% time</button>`
                    : ''
                }
              </div>
            </div>
          `;
        }
      }
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  function renderSetupView(state) {
    const courses = state.courses || [];
    const subjectOptions = courses.length
      ? courses.map((c) => `<option value="${c.name}">${c.name} (${c.credits} cr)</option>`).join('')
      : `<option value="General Studies">General Studies</option>`;

    const classSelect = document.getElementById('class-subject-select');
    const taskSelect = document.getElementById('task-subject-select');
    if (classSelect) classSelect.innerHTML = subjectOptions;
    if (taskSelect) taskSelect.innerHTML = subjectOptions;

    const coursesList = document.getElementById('setup-courses-list');
    if (coursesList) {
      coursesList.innerHTML = courses
        .map((c) => {
          const mult = (state.adaptiveMultipliers && state.adaptiveMultipliers[c.name]) || 1.0;
          return `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
              <div>
                <span class="font-bold text-white">${c.name}</span>
                <span class="text-slate-400 ml-1.5">(${c.code} • ${c.credits} Credits)</span>
              </div>
              <span class="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-semibold">Pace: ${mult}x</span>
            </div>
          `;
        })
        .join('');
    }

    const tasksList = document.getElementById('setup-tasks-list');
    if (tasksList) {
      tasksList.innerHTML = (state.tasks || [])
        .map(
          (t) => `
          <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
            <div class="min-w-0">
              <div class="flex items-center gap-1.5">
                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  t.type === 'EXAM'
                    ? 'bg-rose-500/20 text-rose-300'
                    : t.type === 'LECTURE'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'bg-indigo-500/20 text-indigo-300'
                }">${t.type}</span>
                <span class="font-semibold text-white truncate">${t.title}</span>
              </div>
              <p class="text-[11px] text-slate-400 mt-0.5">${t.subject} • ${Math.round((t.estimatedMins || 60) / 60)}h</p>
            </div>
            <button onclick="window.TimeyUI.deleteConfiguredTask('${t.id}')" class="text-slate-500 hover:text-rose-400 px-2 py-1 cursor-pointer" title="Delete">✕</button>
          </div>
        `
        )
        .join('');
    }

    // Class Rep dropdown
    const repSelect = document.getElementById('rep-cancel-select');
    if (repSelect) {
      const lectures = (state.tasks || []).filter((t) => t.type === 'LECTURE');
      repSelect.innerHTML = lectures.length
        ? lectures.map((l) => `<option value="${l.id}">${l.title}</option>`).join('')
        : `<option value="">No active lectures</option>`;
    }

    const feedList = document.getElementById('broadcast-feed-list');
    if (feedList) {
      feedList.innerHTML = (state.broadcastHistory || [])
        .map(
          (b) => `
          <div class="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs flex justify-between gap-3">
            <span class="text-slate-200">${b.message}</span>
            <span class="text-slate-500 shrink-0">${b.timestamp}</span>
          </div>
        `
        )
        .join('');
    }
  }

  function renderAnalyticsAndChrome(state, overrideSim = null) {
    const sim = overrideSim || state.simulationResult;
    if (sim) {
      const color =
        sim.survivalProbability >= 75
          ? 'text-emerald-400'
          : sim.survivalProbability >= 50
          ? 'text-amber-400'
          : 'text-rose-500';

      const kpiSurv = document.getElementById('kpi-survival');
      if (kpiSurv) {
        kpiSurv.textContent = `${sim.survivalProbability}%`;
        kpiSurv.className = `text-2xl font-black mt-0.5 ${color}`;
      }

      const bigSurv = document.getElementById('analytics-survival-big');
      if (bigSurv) {
        bigSurv.textContent = `${sim.survivalProbability}%`;
        bigSurv.className = `text-4xl font-black mt-1 ${color}`;
      }

      const bigBot = document.getElementById('analytics-bottleneck-big');
      if (bigBot) bigBot.textContent = sim.bottleneckSubject;

      const notesEl = document.getElementById('analytics-notes');
      if (notesEl) notesEl.textContent = sim.disruptionNotes;

      const heatGrid = document.getElementById('burnout-heatmap-grid');
      if (heatGrid) {
        heatGrid.innerHTML = (sim.heatmap14Day || [])
          .map((load, idx) => {
            const boxStyle =
              load > 75
                ? 'bg-rose-500/25 border-rose-500/60 text-rose-200'
                : load >= 50
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200';
            return `
              <div class="border ${boxStyle} rounded-xl p-2.5 text-center">
                <div class="text-[10px] opacity-75">Day ${idx + 1}</div>
                <div class="text-base font-black mt-0.5">${load}%</div>
              </div>
            `;
          })
          .join('');
      }
    }

    const countsEl = document.getElementById('kpi-counts');
    if (countsEl) {
      countsEl.textContent = `${(state.courses || []).length} Courses • ${(state.tasks || []).length} Items`;
    }

    const advisorEl = document.getElementById('ai-advisor-text');
    if (advisorEl) advisorEl.textContent = state.aiAdvisorLog || '';

    const countdownEl = document.getElementById('countdown-text');
    if (countdownEl) {
      const next = (state.schedule || []).find((s) => s.type === 'EXAM' || s.priority === 'CRITICAL') || state.schedule[0];
      countdownEl.textContent = next
        ? `Up Next: "${next.title}" (${DAY_LABELS[next.dayIndex]} @ ${next.startHour}:00)`
        : 'No blocks scheduled yet — go to Courses & Class Setup to add items.';
    }

    document.querySelectorAll('.mode-btn').forEach((btn) => {
      const m = btn.getAttribute('data-mode');
      if (m === state.mode) {
        btn.className =
          m === 'EMERGENCY'
            ? 'mode-btn px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white cursor-pointer'
            : m === 'EXAM'
            ? 'mode-btn px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 cursor-pointer'
            : 'mode-btn px-3 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white cursor-pointer';
      } else {
        btn.className = 'mode-btn px-3 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-white cursor-pointer';
      }
    });
  }

  function renderAll(state) {
    renderTimetableGrid(state);
    renderSetupView(state);
    renderAnalyticsAndChrome(state);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Auth Tabs (Login vs Sign Up)
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const authError = document.getElementById('auth-error');

    tabLogin?.addEventListener('click', () => {
      authError.classList.add('hidden');
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
      tabLogin.className = 'text-sm font-bold text-white border-b-2 border-indigo-500 pb-3 -mb-3.5 cursor-pointer';
      tabSignup.className = 'text-sm font-semibold text-slate-400 hover:text-white pb-3 -mb-3.5 cursor-pointer';
    });

    tabSignup?.addEventListener('click', () => {
      authError.classList.add('hidden');
      signupForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      tabSignup.className = 'text-sm font-bold text-white border-b-2 border-indigo-500 pb-3 -mb-3.5 cursor-pointer';
      tabLogin.className = 'text-sm font-semibold text-slate-400 hover:text-white pb-3 -mb-3.5 cursor-pointer';
    });

    // Login Submit
    loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const res = window.TimeyAuth.loginUser(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
      if (!res.ok) {
        authError.textContent = res.error;
        authError.classList.remove('hidden');
        return;
      }
      enterWorkspace(res.user);
      showToast(`Welcome back, ${res.user.name}!`, 'SUCCESS');
    });

    // Sign Up Submit
    signupForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const res = window.TimeyAuth.registerUser({
        name: document.getElementById('signup-name').value,
        email: document.getElementById('signup-email').value,
        password: document.getElementById('signup-password').value,
        role: document.getElementById('signup-role').value,
        semester: document.getElementById('signup-semester').value
      });
      if (!res.ok) {
        authError.textContent = res.error;
        authError.classList.remove('hidden');
        return;
      }
      enterWorkspace(res.user);
      showToast(`Account created! Add your courses and class timetable to begin.`, 'SUCCESS');
    });

    // 1-Click Demo Logins
    document.getElementById('demo-login-student')?.addEventListener('click', () => {
      const res = window.TimeyAuth.loginUser('student@timey.edu', 'demo123');
      if (res.ok) {
        enterWorkspace(res.user);
        showToast('Signed in as Student Demo (Aarav Sharma)', 'SUCCESS');
      }
    });

    document.getElementById('demo-login-rep')?.addEventListener('click', () => {
      const res = window.TimeyAuth.loginUser('rep@timey.edu', 'demo123');
      if (res.ok) {
        enterWorkspace(res.user);
        showToast('Signed in as Class Rep Demo (Diya Nair)', 'INFO');
      }
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      window.TimeyAuth.logoutUser();
      showAuthScreen();
    });

    // Sidebar Navigation & Quick Goto Buttons
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-view')));
    });
    document.querySelectorAll('.goto-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-goto')));
    });

    // Setup Forms: Add Course, Add Class Slot, Add Exam/Task
    document.getElementById('form-add-course')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('course-name-input');
      const codeInput = document.getElementById('course-code-input');
      const creditsInput = document.getElementById('course-credits-input');
      window.LiveSync.addCourse(nameInput.value, codeInput.value, creditsInput.value);
      nameInput.value = '';
      codeInput.value = '';
      showToast('Course added to your database!', 'SUCCESS');
      await reoptimizeAndSync({ role: 'STUDENT', type: 'COURSE_ADDED' });
    });

    document.getElementById('form-add-class')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = document.getElementById('class-subject-select').value;
      const dayIndex = document.getElementById('class-day-select').value;
      const startHour = document.getElementById('class-hour-select').value;
      const durationHours = document.getElementById('class-dur-select').value;
      window.LiveSync.addFixedClassSlot({
        subject,
        title: `${subject} Lecture`,
        dayIndex,
        startHour,
        durationHours
      });
      showToast(`Locked ${subject} lecture into your weekly timetable!`, 'SUCCESS');
      await reoptimizeAndSync({ role: 'STUDENT', type: 'CLASS_ADDED' });
    });

    document.getElementById('form-add-task')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const subject = document.getElementById('task-subject-select').value;
      const titleInput = document.getElementById('task-title-input');
      const type = document.getElementById('task-type-select').value;
      const deadlineDateStr = document.getElementById('task-deadline-input').value;
      const estimatedHours = document.getElementById('task-hours-select').value;

      window.LiveSync.addAcademicTask({
        subject,
        title: titleInput.value,
        type,
        deadlineDateStr,
        estimatedHours
      });
      titleInput.value = '';
      showToast('Scheduled! Study blocks optimized around your classes.', 'SUCCESS');
      await reoptimizeAndSync({ role: 'STUDENT', type: 'TASK_ADDED' });
    });

    // AI Text / File Import
    const fileInput = document.getElementById('syllabus-file-input');
    const fileLabel = document.getElementById('selected-file-label');
    fileInput?.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        fileLabel.textContent = `Attached: ${fileInput.files[0].name}`;
        fileLabel.classList.remove('hidden');
      }
    });

    document.getElementById('btn-parse-chaos')?.addEventListener('click', async () => {
      const promptInput = document.getElementById('chaos-prompt-input');
      const text = promptInput.value.trim();
      const file = fileInput?.files?.[0] || null;
      if (!text && !file) {
        showToast('Enter text or attach a timetable photo/PDF first.', 'WARNING');
        return;
      }
      const res = await window.GeminiBrain.parseChaosToConstraints(text, file);
      window.AppState.tasks.push(...res.tasks);
      promptInput.value = '';
      if (fileInput) fileInput.value = '';
      fileLabel?.classList.add('hidden');
      showToast(res.note, 'SUCCESS');
      await reoptimizeAndSync({ role: 'STUDENT', type: 'AI_IMPORT' });
      switchView('timetable');
    });

    // Mode Toggles
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        window.AppState.mode = btn.getAttribute('data-mode');
        showToast(`Switched solver to ${window.AppState.mode} mode.`, 'INFO');
        await reoptimizeAndSync({ role: 'STUDENT', type: 'MODE_CHANGE' });
      });
    });

    // Simulate Delay Button
    document.getElementById('btn-trigger-disruption')?.addEventListener('click', async () => {
      window.AppState.tasks.push({
        id: 't-shock-' + Date.now(),
        title: '⚡ Unexpected Delay / Extra Lab',
        subject: 'Disruption',
        credits: 4,
        deadlineISO: window.LiveSync.hoursFromNow(24),
        estimatedMins: 120,
        priority: 'CRITICAL',
        type: 'EXAM',
        fixedDay: 0,
        fixedHour: 14
      });
      showToast('Delay injected Today @ 14:00! Unlocked blocks rippled around pinned slots.', 'WARNING');
      await reoptimizeAndSync({ role: 'STUDENT', type: 'DISRUPTION' });
    });

    // Class Rep Console Buttons
    document.getElementById('btn-rep-cancel')?.addEventListener('click', () => {
      const taskId = document.getElementById('rep-cancel-select')?.value;
      if (!taskId) return;
      window.LiveSync.pushClassRepEvent('CANCEL_LECTURE', { taskId });
      showToast('Cancellation broadcast pushed to all student tabs!', 'SUCCESS');
    });

    document.getElementById('btn-rep-quiz')?.addEventListener('click', () => {
      window.LiveSync.pushClassRepEvent('ADD_SURPRISE_QUIZ', {
        title: document.getElementById('rep-quiz-title')?.value || 'Surprise Quiz',
        subject: 'Operating Systems',
        dayIndex: document.getElementById('rep-quiz-day')?.value || 1,
        startHour: document.getElementById('rep-quiz-hour')?.value || 14
      });
      showToast('Surprise quiz & urgent prep block pushed to all student tabs!', 'DANGER');
    });

    document.getElementById('btn-rep-prepone')?.addEventListener('click', () => {
      window.LiveSync.pushClassRepEvent('RESCHEDULE_EXAM', { hoursShift: -24 });
      showToast('Exam prepone (-24h) broadcast sent!', 'WARNING');
    });

    // What-If Scenarios
    document.querySelectorAll('.whatif-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scenario = btn.getAttribute('data-whatif');
        const simResult = window.ChronosSimulator.simulateWhatIfScenario(window.AppState, scenario);
        renderAnalyticsAndChrome(window.AppState, simResult);
        showToast(`Ran 500 trials for ${scenario}.`, 'INFO');
      });
    });

    // Open 2nd Tab
    document.getElementById('btn-open-rep-tab')?.addEventListener('click', () => {
      window.open(window.location.href, '_blank');
    });

    // API Key Modal
    const modal = document.getElementById('api-modal');
    const keyInput = document.getElementById('gemini-key-input');
    document.getElementById('btn-api-settings')?.addEventListener('click', () => {
      keyInput.value = window.AppState.geminiApiKey || '';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    });
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
    document.getElementById('btn-save-key')?.addEventListener('click', () => {
      window.AppState.geminiApiKey = keyInput.value.trim();
      window.LiveSync.commit({ role: 'STUDENT', type: 'API_KEY' });
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      showToast('API Key settings saved.', 'SUCCESS');
    });

    // Reset Demo
    document.getElementById('btn-reset-demo')?.addEventListener('click', () => {
      window.LiveSync.resetDemoState();
      showToast('Sample data restored.', 'INFO');
    });

    // Subscribe to LiveSync
    window.LiveSync.subscribe((state, meta) => {
      renderAll(state);
      if (meta && meta.fromRemote && meta.alertText) {
        showToast(meta.alertText, 'DANGER');
      }
    });

    // Check if user is already logged in on page refresh
    const existingUser = window.TimeyAuth ? window.TimeyAuth.getCurrentUser() : null;
    if (existingUser) {
      enterWorkspace(existingUser);
    } else {
      showAuthScreen();
    }
  });

  window.TimeyUI = {
    toggleSlotLock,
    logTaskFinished,
    deleteConfiguredTask,
    showToast
  };
})();