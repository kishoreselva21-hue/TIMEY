/**
 * auth-db.js
 * Persistent Multi-User Database & Authentication Layer for Timey
 */

(function () {
  const USERS_DB_KEY = 'TIMEY_USERS_DB_V2';
  const SESSION_KEY = 'TIMEY_ACTIVE_SESSION_V2';

  function loadUsersDB() {
    try {
      return JSON.parse(localStorage.getItem(USERS_DB_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveUsersDB(db) {
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(db));
  }

  // Seed two ready-to-use demo accounts so judges or teammates can log in with 1 click
  function ensureDemoAccounts() {
    const db = loadUsersDB();
    if (!db['student@timey.edu']) {
      db['student@timey.edu'] = {
        email: 'student@timey.edu',
        password: 'demo123',
        name: 'Aarav Sharma',
        role: 'STUDENT',
        semester: 'Sem 5 • B.Tech CSE',
        createdAt: Date.now()
      };
    }
    if (!db['rep@timey.edu']) {
      db['rep@timey.edu'] = {
        email: 'rep@timey.edu',
        password: 'demo123',
        name: 'Diya Nair (Class Rep)',
        role: 'CLASS_REP',
        semester: 'Sem 5 • B.Tech CSE',
        createdAt: Date.now()
      };
    }
    saveUsersDB(db);
  }

  function registerUser({ name, email, password, role, semester }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!name || !cleanEmail || !password) {
      return { ok: false, error: 'Please fill in your name, email, and password.' };
    }
    const db = loadUsersDB();
    if (db[cleanEmail]) {
      return { ok: false, error: 'An account with this email already exists. Please log in.' };
    }
    const user = {
      email: cleanEmail,
      password,
      name: name.trim(),
      role: role === 'CLASS_REP' ? 'CLASS_REP' : 'STUDENT',
      semester: (semester || 'Semester 5').trim(),
      createdAt: Date.now()
    };
    db[cleanEmail] = user;
    saveUsersDB(db);
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return { ok: true, user };
  }

  function loginUser(email, password) {
    ensureDemoAccounts();
    const cleanEmail = (email || '').trim().toLowerCase();
    const db = loadUsersDB();
    const user = db[cleanEmail];
    if (!user || user.password !== password) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    return { ok: true, user };
  }

  function getCurrentUser() {
    ensureDemoAccounts();
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  }

  function logoutUser() {
    localStorage.removeItem(SESSION_KEY);
  }

  ensureDemoAccounts();

  window.TimeyAuth = {
    registerUser,
    loginUser,
    getCurrentUser,
    logoutUser
  };
})();