/**
 * live-sync.js
 * Multi-User State Persistence + Real-Time Class Rep <-> Student Synchronization
 */

(function () {
  const CHANNEL_NAME = 'timey_live_sync_v2';
  const SHARED_BROADCAST_KEY = 'TIMEY_SHARED_BROADCASTS_V2';

  function hoursFromNow(hours) {
    return new Date(Date.now() + hours * 3600 * 1000).toISOString();
  }

  const DEFAULT_ENERGY_PROFILE = [
    0.1, 0.1, 0.1, 0.1, 0.15, 0.3,
    0.55, 0.75, 0.9, 1.0, 0.95, 0.85,
    0.65, 0.6, 0.7, 0.8, 0.9, 0.85,
    0.75, 0.65, 0.55, 0.4, 0.25, 0.15
  ];

  function getUserStorageKey(user) {
    const id = user && user.email ? user.email.toLowerCase() : 'guest';
    return `TIMEY_DATA_${id}`;
  }

  function getDefaultStateForUser(user) {
    const isFreshSignup = user && user.email !== 'student@timey.edu' && user.email !== 'rep@timey.edu';

    return {
      version: 2,
      ownerEmail: user ? user.email : 'guest',
      lastUpdated: Date.now(),
      mode: 'STANDARD',
      geminiApiKey: '',
      energyProfile: DEFAULT_ENERGY_PROFILE,
      courses: [
        { id: 'c-1', name: 'Data Structures', code: 'CS301', credits: 4, color: 'indigo' },
        { id: 'c-2', name: 'Operating Systems', code: 'CS304', credits: 4, color: 'sky' },
        { id: 'c-3', name: 'Linear Algebra', code: 'MA202', credits: 3, color: 'emerald' },
        { id: 'c-4', name: 'Computer Networks', code: 'CS308', credits: 3, color: 'violet' }
      ],
      adaptiveMultipliers: {
        'Data Structures': 1.2,
        'Operating Systems': 1.1,
        'Linear Algebra': 1.0,
        'Computer Networks': 1.0
      },
      tasks: isFreshSignup
        ? [
            {
              id: 't-welcome-1',
              title: 'Data Structures: Core Revision',
              subject: 'Data Structures',
              credits: 4,
              deadlineISO: hoursFromNow(48),
              estimatedMins: 120,
              priority: 'HIGH',
              type: 'STUDY'
            }
          ]
        : [
            {
              id: 't-lec-1',
              title: 'CS301: Trees & Graphs Lecture',
              subject: 'Data Structures',
              credits: 4,
              deadlineISO: hoursFromNow(28),
              estimatedMins: 120,
              priority: 'HIGH',
              type: 'LECTURE',
              fixedDay: 0,
              fixedHour: 9
            },
            {
              id: 't-lec-2',
              title: 'CS304: Deadlocks Lecture',
              subject: 'Operating Systems',
              credits: 4,
              deadlineISO: hoursFromNow(52),
              estimatedMins: 120,
              priority: 'HIGH',
              type: 'LECTURE',
              fixedDay: 1,
              fixedHour: 11
            },
            {
              id: 't-study-1',
              title: 'AVL Tree Balancing Lab Prep',
              subject: 'Data Structures',
              credits: 4,
              deadlineISO: hoursFromNow(36),
              estimatedMins: 120,
              priority: 'CRITICAL',
              type: 'STUDY'
            },
            {
              id: 't-study-2',
              title: 'Eigenvalues Problem Set 4',
              subject: 'Linear Algebra',
              credits: 3,
              deadlineISO: hoursFromNow(60),
              estimatedMins: 120,
              priority: 'MEDIUM',
              type: 'STUDY'
            },
            {
              id: 't-exam-1',
              title: 'Mid-Sem Quiz: Memory Paging',
              subject: 'Operating Systems',
              credits: 4,
              deadlineISO: hoursFromNow(46),
              estimatedMins: 120,
              priority: 'CRITICAL',
              type: 'EXAM'
            }
          ],
      schedule: [],
      broadcastHistory: JSON.parse(localStorage.getItem(SHARED_BROADCAST_KEY) || 'null') || [
        {
          id: 'b-init',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: 'INFO',
          message: 'Academic workspace synced and ready.'
        }
      ],
      simulationResult: {
        survivalProbability: 84,
        heatmap14Day: [35, 50, 72, 65, 40, 30, 55, 78, 85, 60, 45, 35, 50, 40],
        bottleneckSubject: 'Data Structures',
        disruptionNotes: 'Schedule healthy. Add courses or deadlines in Setup to re-evaluate.'
      },
      aiAdvisorLog:
        'Your study blocks are aligned to peak morning focus (9 AM – 12 PM) around your fixed class lectures.'
    };
  }

  function loadStateForCurrentUser() {
    const user = window.TimeyAuth ? window.TimeyAuth.getCurrentUser() : null;
    const key = getUserStorageKey(user);
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.tasks) {
          parsed.broadcastHistory =
            JSON.parse(localStorage.getItem(SHARED_BROADCAST_KEY) || 'null') || parsed.broadcastHistory || [];
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[LiveSync] State read error:', e);
    }
    return getDefaultStateForUser(user);
  }

  window.AppState = loadStateForCurrentUser();

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;
  const listeners = new Set();

  function notifyListeners(meta = {}) {
    listeners.forEach((cb) => {
      try {
        cb(window.AppState, meta);
      } catch (err) {
        console.error(err);
      }
    });
  }

  function commitState(meta = { source: 'LOCAL' }) {
    const user = window.TimeyAuth ? window.TimeyAuth.getCurrentUser() : null;
    const key = getUserStorageKey(user);
    window.AppState.lastUpdated = Date.now();

    try {
      localStorage.setItem(key, JSON.stringify(window.AppState));
      localStorage.setItem(SHARED_BROADCAST_KEY, JSON.stringify(window.AppState.broadcastHistory || []));
    } catch (e) {
      console.warn('[LiveSync] Save failed:', e);
    }

    if (channel && !meta.fromRemote) {
      channel.postMessage({
        type: 'TIMEY_SYNC',
        meta,
        broadcastHistory: window.AppState.broadcastHistory,
        classEvent: meta.classEvent || null
      });
    }

    notifyListeners(meta);
  }

  // Apply incoming Class Rep live events to the currently logged-in student's own database
  function applyIncomingClassEvent(event) {
    if (!event) return;
    if (event.actionType === 'CANCEL_LECTURE') {
      window.AppState.tasks = window.AppState.tasks.filter(
        (t) => t.id !== event.taskId && t.title !== event.title
      );
      window.AppState.schedule = window.AppState.schedule.filter(
        (s) => s.taskId !== event.taskId && s.title !== event.title
      );
    } else if (event.actionType === 'ADD_SURPRISE_QUIZ') {
      window.AppState.tasks.push(event.quizTask, event.prepTask);
    } else if (event.actionType === 'RESCHEDULE_EXAM') {
      const examTask = window.AppState.tasks.find((t) => t.type === 'EXAM') || window.AppState.tasks[0];
      if (examTask) {
        const cur = new Date(examTask.deadlineISO).getTime();
        examTask.deadlineISO = new Date(Math.max(Date.now() + 6 * 3600000, cur + event.hoursShift * 3600000)).toISOString();
        examTask.priority = 'CRITICAL';
      }
    }

    if (window.ChronosSolver) window.ChronosSolver.solveSchedule(window.AppState);
    if (window.ChronosSimulator) window.ChronosSimulator.runMonteCarlo(window.AppState);
  }

  if (channel) {
    channel.onmessage = (e) => {
      if (e.data && e.data.type === 'TIMEY_SYNC') {
        if (e.data.broadcastHistory) {
          window.AppState.broadcastHistory = e.data.broadcastHistory;
        }
        if (e.data.classEvent) {
          applyIncomingClassEvent(e.data.classEvent);
          const user = window.TimeyAuth ? window.TimeyAuth.getCurrentUser() : null;
          localStorage.setItem(getUserStorageKey(user), JSON.stringify(window.AppState));
        }
        notifyListeners({ ...e.data.meta, fromRemote: true });
      }
    };
  }

  // Course & Schedule Setup Helpers (Add Course, Add Class Slot, Add Exam/Assignment, Delete Item)
  function addCourse(name, code, credits) {
    const cleanName = (name || '').trim();
    if (!cleanName) return;
    const colors = ['indigo', 'sky', 'emerald', 'violet', 'amber', 'rose'];
    const color = colors[window.AppState.courses.length % colors.length];
    window.AppState.courses.push({
      id: 'c-' + Date.now(),
      name: cleanName,
      code: (code || 'SUBJ').trim().toUpperCase(),
      credits: Number(credits) || 3,
      color
    });
    if (!window.AppState.adaptiveMultipliers[cleanName]) {
      window.AppState.adaptiveMultipliers[cleanName] = 1.0;
    }
  }

  function addFixedClassSlot({ subject, title, dayIndex, startHour, durationHours }) {
    const course = window.AppState.courses.find((c) => c.name === subject);
    window.AppState.tasks.push({
      id: 't-class-' + Date.now(),
      title: title || `${subject} Class`,
      subject,
      credits: course ? course.credits : 3,
      deadlineISO: hoursFromNow(168),
      estimatedMins: (Number(durationHours) || 1) * 60,
      priority: 'HIGH',
      type: 'LECTURE',
      fixedDay: Number(dayIndex),
      fixedHour: Number(startHour)
    });
  }

  function addAcademicTask({ subject, title, type, deadlineDateStr, estimatedHours, priority }) {
    const course = window.AppState.courses.find((c) => c.name === subject);
    let deadlineISO = hoursFromNow(48);
    if (deadlineDateStr) {
      const parsed = new Date(deadlineDateStr).getTime();
      if (!isNaN(parsed)) deadlineISO = new Date(parsed).toISOString();
    }
    window.AppState.tasks.push({
      id: 't-user-' + Date.now(),
      title: title.trim(),
      subject,
      credits: course ? course.credits : 3,
      deadlineISO,
      estimatedMins: Math.max(1, Number(estimatedHours) || 2) * 60,
      priority: priority || (type === 'EXAM' ? 'CRITICAL' : 'HIGH'),
      type: type || 'STUDY'
    });
  }

  function removeTask(taskId) {
    window.AppState.tasks = window.AppState.tasks.filter((t) => t.id !== taskId);
    window.AppState.schedule = window.AppState.schedule.filter((s) => s.taskId !== taskId);
  }

  function pushClassRepEvent(actionType, payload) {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let alertText = '';
    let classEvent = null;

    if (actionType === 'CANCEL_LECTURE') {
      const task = window.AppState.tasks.find((t) => t.id === payload.taskId);
      const title = task ? task.title : 'Scheduled Lecture';
      classEvent = { actionType, taskId: payload.taskId, title };
      applyIncomingClassEvent(classEvent);
      alertText = `CLASS REP: "${title}" cancelled. Free slot reclaimed & timetable re-optimized!`;
    } else if (actionType === 'ADD_SURPRISE_QUIZ') {
      const dayIdx = Number(payload.dayIndex || 1);
      const startHr = Number(payload.startHour || 14);
      const subject = payload.subject || 'Operating Systems';
      const title = payload.title || `Surprise Quiz: ${subject}`;

      const quizTask = {
        id: 't-rep-' + Date.now(),
        title,
        subject,
        credits: 4,
        deadlineISO: hoursFromNow((dayIdx + 1) * 24),
        estimatedMins: 60,
        priority: 'CRITICAL',
        type: 'EXAM',
        fixedDay: dayIdx,
        fixedHour: startHr,
        isClassRepEvent: true
      };
      const prepTask = {
        id: 't-prep-' + Date.now(),
        title: `Urgent Prep: ${title}`,
        subject,
        credits: 4,
        deadlineISO: hoursFromNow(dayIdx * 24 + startHr),
        estimatedMins: 60,
        priority: 'CRITICAL',
        type: 'STUDY'
      };
      classEvent = { actionType, quizTask, prepTask };
      applyIncomingClassEvent(classEvent);
      alertText = `CLASS REP: "${title}" added on Day ${dayIdx + 1} @ ${startHr}:00 with auto-prep!`;
    } else if (actionType === 'RESCHEDULE_EXAM') {
      const hoursShift = Number(payload.hoursShift || -24);
      classEvent = { actionType, hoursShift };
      applyIncomingClassEvent(classEvent);
      alertText = `CLASS REP: Exam deadline moved 24 hours EARLIER!`;
    }

    if (alertText) {
      window.AppState.broadcastHistory.unshift({
        id: 'b-' + Date.now(),
        timestamp,
        type: 'BROADCAST',
        message: alertText
      });
    }

    commitState({
      role: 'CLASS_REP',
      type: 'CLASS_REP_BROADCAST',
      alertText,
      classEvent
    });
  }

  function reloadUserSession() {
    window.AppState = loadStateForCurrentUser();
    if (window.ChronosSolver) window.ChronosSolver.solveSchedule(window.AppState);
    if (window.ChronosSimulator) window.ChronosSimulator.runMonteCarlo(window.AppState);
    commitState({ role: 'SYSTEM', type: 'SESSION_LOADED' });
  }

  function resetDemoState() {
    const user = window.TimeyAuth ? window.TimeyAuth.getCurrentUser() : null;
    window.AppState = getDefaultStateForUser(user);
    if (window.ChronosSolver) window.ChronosSolver.solveSchedule(window.AppState);
    if (window.ChronosSimulator) window.ChronosSimulator.runMonteCarlo(window.AppState);
    commitState({ role: 'SYSTEM', type: 'RESET' });
  }

  window.LiveSync = {
    getState: () => window.AppState,
    commit: commitState,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    addCourse,
    addFixedClassSlot,
    addAcademicTask,
    removeTask,
    pushClassRepEvent,
    reloadUserSession,
    resetDemoState,
    hoursFromNow
  };
})();