// Firebase 設定 — PWA 版本，使用官方 Web SDK
// V11: 新架構 /projects/${pid}/  (舊路徑 /users/${uid}/tripdb/ 已廢棄)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signOut as fbSignOut, onAuthStateChanged, getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBj0BAvik2icCn32O8uvEQd66F78QcZ43Y",
  authDomain: "trip-planner-d94a9.firebaseapp.com",
  databaseURL: "https://trip-planner-d94a9-default-rtdb.firebaseio.com",
  projectId: "trip-planner-d94a9",
  storageBucket: "trip-planner-d94a9.firebasestorage.app",
  messagingSenderId: "972652807406",
  appId: "1:972652807406:web:c3a8d98c656de58dc31fff"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db_  = getDatabase(app);

// ═══════════════════════════════════════════════════════════════════
//  Auth — same public interface as before
// ═══════════════════════════════════════════════════════════════════

window.signInWithGoogle = async function() {
  const provider = new GoogleAuthProvider();
  const result   = await signInWithPopup(auth, provider);
  return { uid: result.user.uid, email: result.user.email };
};

window.signOut = async function() {
  await fbSignOut(auth);
};

window.getCurrentUser = function() {
  return auth.currentUser
    ? { uid: auth.currentUser.uid, email: auth.currentUser.email }
    : null;
};

window.restoreAuth = async function() {
  try {
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult && redirectResult.user) {
      return { uid: redirectResult.user.uid, email: redirectResult.user.email };
    }
  } catch(e) {
    console.warn('redirect 登入結果處理失敗', e);
    window.lastAuthError = (e.message || e.code || String(e));
  }
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ? { uid: user.uid, email: user.email } : null);
    });
  });
};

window.forceAccountSwitch = async function() { return true; };

onAuthStateChanged(auth, (user) => {
  if (window.onAuthChange) window.onAuthChange(user);
});

// ── Token refresh (SDK equivalent) ──
// The Firebase Web SDK refreshes tokens automatically on every call.
// This explicit function exists for API parity with the Extension
// (used by SSE reconnect logic in Phase 1).
window.refreshFirebaseToken = async function() {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    await user.getIdToken(true); // force refresh
    return true;
  } catch(e) { console.warn('refreshFirebaseToken failed', e); return false; }
};

// ═══════════════════════════════════════════════════════════════════
//  Adapter utilities (same logic as Extension, SDK-based)
// ═══════════════════════════════════════════════════════════════════

function _arrayToMap(arr) {
  const map = {};
  (arr || []).forEach(item => { if (item && item.id) map[item.id] = item; });
  return map;
}

function _mapToArray(map) {
  if (!map) return [];
  if (Array.isArray(map)) return map;
  return Object.values(map).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

// ═══════════════════════════════════════════════════════════════════
//  New project-centric helpers (SDK equivalents of Extension's projRead etc.)
//  Exposed on window so app.js can call them in later phases.
// ═══════════════════════════════════════════════════════════════════

async function _projRead(pid) {
  try {
    const snap = await get(ref(db_, `projects/${pid}`));
    return snap.exists() ? snap.val() : null;
  } catch(e) { console.warn('projRead failed', e); return null; }
}

async function _projPut(pid, data) {
  try { await set(ref(db_, `projects/${pid}`), data); return true; }
  catch(e) { console.warn('projPut failed', e); return false; }
}

async function _projPatch(pid, subPath, value) {
  try { await set(ref(db_, `projects/${pid}/${subPath}`), value); return true; }
  catch(e) { console.warn('projPatch failed', e); return false; }
}

async function _projDelete(pid, subPath) {
  try { await remove(ref(db_, `projects/${pid}/${subPath}`)); return true; }
  catch(e) { console.warn('projDelete failed', e); return false; }
}

async function _userProjectsRead() {
  const user = auth.currentUser; if (!user) return {};
  try {
    const snap = await get(ref(db_, `users/${user.uid}/user_projects`));
    return snap.exists() ? snap.val() : {};
  } catch(e) { return {}; }
}

async function _userProjectsAdd(pid) {
  const user = auth.currentUser; if (!user) return false;
  try { await set(ref(db_, `users/${user.uid}/user_projects/${pid}`), true); return true; }
  catch(e) { return false; }
}

// Expose for Phase 2+ use from app.js
window.projRead   = _projRead;
window.projPut    = _projPut;
window.projPatch  = _projPatch;
window.projDelete = _projDelete;

// MERGE (HTTP PATCH) — field-level merge at a sub-path.
// Unlike projPatch (PUT), this only updates the specified keys
// and leaves unmentioned keys untouched. Use for concurrent-safe
// single-field edits (e.g. rating, note).
window.projMerge = async function(pid, subPath, fields) {
  try {
    await update(ref(db_, `projects/${pid}/${subPath}`), fields);
    return true;
  } catch(e) { console.warn('projMerge failed', e); return false; }
};

// ═══════════════════════════════════════════════════════════════════
//  fbRead / fbWrite — same interface as before
// ═══════════════════════════════════════════════════════════════════

window.fbRead = async function() {
  const user = auth.currentUser;
  if (!user) return null;

  // 1. Read user's project index
  const userIndex = await _userProjectsRead();
  const pids = Object.keys(userIndex);

  if (!pids.length) return null;  // new user, no projects yet

  // 2. Read all projects in parallel
  const projResults = await Promise.all(pids.map(pid => _projRead(pid)));

  // 2b. If every read returned null but we have pids, likely an auth issue
  const allNull = projResults.every(r => r === null);
  if (allNull && pids.length > 0) return { __authFailed: true };

  // 3. Assemble the db shape that app.js expects
  const assembled = { projects: [], wishlist: {}, trips: {} };

  pids.forEach((pid, i) => {
    const proj = projResults[i];
    if (!proj) return;

    const info = proj.info || {};
    assembled.projects.push({
      id:          pid,
      name:        info.name        || '',
      destination: info.destination || '',
      startDate:   info.startDate   || '',
      endDate:     info.endDate     || '',
      color:       info.color       || '',
      createdAt:   info.createdAt   || 0,
      ownerId:     info.ownerId     || '',
      members:     proj.members     || {},
      dayNames:    proj.dayNames    || {},
      transit:     proj.transit     || {},
    });

    assembled.wishlist[pid] = _mapToArray(proj.wishlist);
    assembled.trips[pid]    = _mapToArray(proj.trips);
  });

  return assembled;
};

window.fbWrite = async function(data) {
  const user = auth.currentUser;
  if (!user) return false;

  const projects = data.projects || [];
  if (!projects.length) return true;

  let allOk = true;

  for (const proj of projects) {
    const pid = proj.id;
    if (!pid) continue;

    const info = {
      name:        proj.name        || '',
      destination: proj.destination || '',
      startDate:   proj.startDate   || '',
      endDate:     proj.endDate     || '',
      color:       proj.color       || '',
      createdAt:   proj.createdAt   || Date.now(),
      ownerId:     user.uid,
    };
    const wishlist = _arrayToMap(data.wishlist?.[pid]);
    const trips    = _arrayToMap(data.trips?.[pid]);

    // First write: PUT atomically with members so the owner node exists
    // before any subsequent sub-path writes (required by Firebase Rules).
    // Subsequent writes: PATCH only content, never overwrite members.
    const existing = await _projRead(pid);

    let ok;
    if (!existing) {
      ok = await _projPut(pid, {
        info,
        members:  { [user.uid]: { role: 'owner', nickname: '', displayName: user.displayName || user.email || '' } },
        wishlist,
        trips,
      });
    } else {
      const infoOk = await _projPatch(pid, 'info',     info);
      const wishOk = await _projPatch(pid, 'wishlist', wishlist);
      const tripOk = await _projPatch(pid, 'trips',    trips);
      ok = infoOk && wishOk && tripOk;
      if (!ok) console.warn('[fbWrite] partial failure', pid, { infoOk, wishOk, tripOk });
    }

    if (!ok) { allOk = false; continue; }
    await _userProjectsAdd(pid);
  }

  return allOk;
};

// ═══════════════════════════════════════════════════════════════════
//  Checklist API — path updated to /projects/${pid}/checklists/${uid}/
// ═══════════════════════════════════════════════════════════════════

window.clApiRead = async function(pid) {
  const user = auth.currentUser; if (!user || !pid) return null;
  try {
    const snap = await get(ref(db_, `projects/${pid}/checklists/${user.uid}`));
    return snap.exists() ? snap.val() : null;
  } catch(e) { return null; }
};

window.clApiPut = async function(pid, data) {
  const user = auth.currentUser; if (!user || !pid) return false;
  try { await set(ref(db_, `projects/${pid}/checklists/${user.uid}`), data); return true; }
  catch(e) { return false; }
};

window.clApiPatch = async function(pid, updates) {
  const user = auth.currentUser; if (!user || !pid) return false;
  try {
    // Firebase SDK update() natively supports slash-separated keys
    // e.g. { "taskId/done": true } merges only the "done" field.
    // No manual nesting needed — passing flat paths is correct and safe.
    await update(ref(db_, `projects/${pid}/checklists/${user.uid}`), updates);
    return true;
  } catch(e) { return false; }
};

window.clApiDelete = async function(pid, taskId) {
  const user = auth.currentUser; if (!user || !pid || !taskId) return false;
  try { await remove(ref(db_, `projects/${pid}/checklists/${user.uid}/${taskId}`)); return true; }
  catch(e) { return false; }
};

// ═══════════════════════════════════════════════════════════════════
//  Phase 2 helpers — Invite codes & user-project index (PWA)
// ═══════════════════════════════════════════════════════════════════

/** Expose userProjectsAdd so app.js can call it after joining a project. */
window.userProjectsRemove = async function(pid) {
  const user = auth.currentUser; if (!user || !pid) return false;
  try { await remove(ref(db_, `users/${user.uid}/user_projects/${pid}`)); return true; }
  catch(e) { console.warn('userProjectsRemove failed', e); return false; }
};

window.userProjectsAdd = async function(pid) {
  const user = auth.currentUser; if (!user || !pid) return false;
  try { await set(ref(db_, `users/${user.uid}/user_projects/${pid}`), true); return true; }
  catch(e) { console.warn('userProjectsAdd failed', e); return false; }
};

/**
 * Write an invite code to /invite_codes/<code>
 * Value is a JSON string: { pid, createdAt }
 */
window.writeInviteCode = async function(code, pid) {
  try {
    const payload = { pid, createdAt: Date.now() };
    await set(ref(db_, `invite_codes/${code}`), payload);
    return true;
  } catch(e) { console.warn('writeInviteCode failed', e); return false; }
};

/**
 * Read an invite code. Returns { pid, createdAt } or null.
 * Handles both legacy JSON-string format and new structured object format.
 */
window.readInviteCode = async function(code) {
  try {
    const snap = await get(ref(db_, `invite_codes/${code}`));
    if (!snap.exists()) return null;
    const val = snap.val();
    return typeof val === 'string' ? JSON.parse(val) : val;
  } catch(e) { return null; }
};

/**
 * List all invite codes (for cleanup). Returns object map or null.
 */
window.listInviteCodes = async function() {
  try {
    const snap = await get(ref(db_, 'invite_codes'));
    return snap.exists() ? snap.val() : null;
  } catch(e) { return null; }
};

/**
 * Delete a specific invite code.
 */
window.deleteInviteCode = async function(code) {
  try { await remove(ref(db_, `invite_codes/${code}`)); return true; }
  catch(e) { return false; }
};

// ═══════════════════════════════════════════════════════════════════
//  Real-time listener helper — used by app.js for SSE-equivalent sync
// ═══════════════════════════════════════════════════════════════════

/**
 * Attach a real-time listener on a database path.
 * Returns an unsubscribe function.
 * @param {string} path — e.g. 'projects/{pid}/wishlist'
 * @param {Function} callback — receives the value (object or null)
 */
window.fbListen = function(path, callback) {
  const dbRef = ref(db_, path);
  return onValue(dbRef, (snap) => {
    callback(snap.exists() ? snap.val() : null);
  }, (err) => {
    console.warn('[fbListen] error on', path, err);
  });
};
