// Firebase 設定 — PWA 版本，使用官方 Web SDK（不受擴充功能 CSP 限制，可以用 CDN）
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as fbSignOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, get, set
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db_ = getDatabase(app);

// 手機瀏覽器對 signInWithPopup 的支援度不穩定（sessionStorage 在某些環境會被分區隔離），
// 改用 signInWithRedirect：整頁跳轉到 Google 登入頁，登入完成後跳回來，相容性更好
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// 與擴充功能版本相同的函式介面，讓 app.js 不需要改呼叫方式
// 注意：signInWithRedirect 在 authDomain 與實際網站網域不同時，
// 會依賴跨網域 iframe 存取第三方儲存空間，這在 iOS Safari 16.1+ 等瀏覽器會被封鎖而完全失效。
// signInWithPopup 不依賴這個機制，相容性更好，所以兩種裝置都優先使用 popup。
window.signInWithGoogle = async function() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return { uid: result.user.uid, email: result.user.email };
};

window.signOut = async function() {
  await fbSignOut(auth);
};

window.getCurrentUser = function() {
  return auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : null;
};

window.restoreAuth = async function() {
  // 先檢查是不是從 redirect 登入跳轉回來的（手機版流程）
  try {
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult && redirectResult.user) {
      return { uid: redirectResult.user.uid, email: redirectResult.user.email };
    }
  } catch(e) {
    console.warn('redirect 登入結果處理失敗', e);
    window.lastAuthError = (e.message || e.code || String(e));
  }
  // PWA 版本用 onAuthStateChanged 自動恢復，這裡只是等待初始化完成
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user ? { uid: user.uid, email: user.email } : null);
    });
  });
};

window.fbRead = async function() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await get(ref(db_, `users/${user.uid}/tripdb`));
  return snap.exists() ? snap.val() : null;
};

window.fbWrite = async function(data) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await set(ref(db_, `users/${user.uid}/tripdb`), data);
    return true;
  } catch(e) {
    console.warn('Firebase 寫入失敗', e);
    return false;
  }
};

// PWA 不需要換帳號的特殊處理（瀏覽器原生會跳帳號選擇視窗）
window.forceAccountSwitch = async function() { return true; };

// 監聽登入狀態變化，自動更新畫面（取代擴充功能版本的 onclick 內手動呼叫）
onAuthStateChanged(auth, (user) => {
  if (window.onAuthChange) window.onAuthChange(user);
});
