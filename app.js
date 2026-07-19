// ── 偵測 LINE / Instagram / Facebook 等內嵌瀏覽器（in-app webview）──
// Google 自 2021 年起政策性封鎖所有嵌入式 webview 對 OAuth 登入端點的請求，
// 這些環境裡不管程式碼寫得多正確，登入都會被 Google 主動擋下，顯示令人困惑的錯誤。
// 解法是在偵測到這類環境時，直接顯示提醒畫面，引導使用者改用手機原生瀏覽器開啟。
(function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  const isLine = /\bLine\//i.test(ua);
  const isFacebook = /FBAN|FBAV/i.test(ua);
  const isInstagram = /Instagram/i.test(ua);
  if (!isLine && !isFacebook && !isInstagram) return;

  const appName = isLine ? 'LINE' : (isInstagram ? 'Instagram' : 'Facebook');
  const url = window.location.href;

  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#15171a;color:#e8e8e8;font-family:-apple-system,sans-serif">
        <div style="font-size:40px">⚠️</div>
        <div style="font-size:17px;font-weight:600">請複製連結到瀏覽器開啟</div>
        <div style="font-size:13px;color:#a0a0a0;max-width:300px;line-height:1.8">
          目前是用 ${appName} 內建的瀏覽器開啟，Google 帳號登入在這個環境裡一定無法使用，包含「以外部瀏覽器開啟」這個選項也不一定有效。<br><br>
          請照下面步驟操作：
        </div>
        <div style="background:#1d2024;border:1px solid #3a3d44;border-radius:10px;padding:14px 16px;max-width:300px;text-align:left;font-size:13px;line-height:2">
          <div>① 點下方「複製連結」</div>
          <div>② 離開 ${appName}，打開手機的 Safari 或 Chrome</div>
          <div>③ 貼上連結並前往</div>
        </div>
        <div style="background:#22252b;border:1px solid #3a3d44;border-radius:8px;padding:10px 14px;font-size:12px;word-break:break-all;max-width:300px;color:#52b788">${url}</div>
        <button id="copy-link-btn" style="background:#52b788;color:#fff;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;cursor:pointer;margin-top:2px">複製連結</button>
        <div id="copy-status" style="font-size:12px;color:#52b788;min-height:16px"></div>
        <div style="border-top:1px solid #2a2d33;width:100%;max-width:300px;margin-top:10px;padding-top:14px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">加到主畫面，下次不用再複製</div>
          <div style="background:#1d2024;border:1px solid #3a3d44;border-radius:10px;padding:14px 16px;max-width:300px;text-align:left;font-size:12px;line-height:2;color:#c0c0c0">
            <div><b style="color:#e8e8e8">iPhone（Safari）：</b>點下方分享圖示 <span style="color:#52b788">⬆️</span> → 「加入主畫面」</div>
            <div style="margin-top:6px"><b style="color:#e8e8e8">Android（Chrome）：</b>點右上角選單 ⋮ → 「加到主畫面」</div>
          </div>
        </div>
      </div>`;
    const btn = document.getElementById('copy-link-btn');
    const status = document.getElementById('copy-status');
    if (btn) btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = '已複製，請貼到瀏覽器網址列開啟';
      } catch {
        if (status) status.textContent = '複製失敗，請手動長按上方連結複製';
      }
    };
  });
  window.__inAppBrowserBlocked = true;
})();

// ── Stage 2 & 3: A2HS prompt / Standalone detection ──
(function detectInstallState() {
  if (window.__inAppBrowserBlocked) return; // Stage 1 already handled
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return; // Stage 3: already installed, skip
  if (sessionStorage.getItem('a2hs-dismissed')) return; // already dismissed this session

  document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.createElement('div');
    overlay.id = 'pwa-install-prompt';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:var(--bg,#f7f6f2);color:var(--text,#1a1916);font-family:-apple-system,sans-serif';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    overlay.innerHTML = `
      <div style="font-size:40px">📲</div>
      <div style="font-size:17px;font-weight:600">加到主畫面，使用更流暢</div>
      <div style="font-size:13px;color:var(--text2,#6b6a62);max-width:300px;line-height:1.8">
        將此應用加到主畫面後，可以像原生 App 一樣全螢幕使用，啟動更快、體驗更好。
      </div>
      <div style="background:var(--surface2,#f0efe9);border:1px solid var(--border,#e2e0d8);border-radius:10px;padding:14px 16px;max-width:300px;text-align:left;font-size:13px;line-height:2">
        ${isIOS
          ? '<div>① 點擊底部的分享按鈕 <span style="color:var(--accent,#2d6a4f)">⬆️</span></div><div>② 選擇「加入主畫面」</div>'
          : '<div>① 點擊右上角選單 <b>⋮</b></div><div>② 選擇「加到主畫面」</div>'}
      </div>
      <button id="a2hs-dismiss" style="background:none;border:1px solid var(--border,#e2e0d8);border-radius:8px;padding:10px 24px;font-size:13px;color:var(--text2,#6b6a62);cursor:pointer;margin-top:6px">略過，繼續使用網頁版</button>`;
    document.body.appendChild(overlay);
    document.getElementById('a2hs-dismiss').onclick = () => {
      overlay.remove();
      sessionStorage.setItem('a2hs-dismissed', '1');
    };
  });
})();

window.chromeShim = {
  storage: {
    local: {
      get: (keys, callback) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach(k => {
          const v = localStorage.getItem('tp_' + k);
          if (v !== null) { try { result[k] = JSON.parse(v); } catch { result[k] = v; } }
        });
        if (typeof callback === 'function') {
          callback(result); // 舊式 callback 寫法：chrome.storage.local.get([...], cb)
          return;
        }
        return Promise.resolve(result); // await 寫法：await chrome.storage.local.get([...])
      },
      set: async (obj) => {
        Object.entries(obj).forEach(([k, v]) => localStorage.setItem('tp_' + k, JSON.stringify(v)));
      },
      remove: async (key) => {
        const list = Array.isArray(key) ? key : [key];
        list.forEach(k => localStorage.removeItem('tp_' + k));
      }
    },
    onChanged: { addListener: () => {} } // PWA 單分頁不需要跨分頁監聽，留空避免報錯
  },
  tabs: {
    query: (opts, cb) => cb([{ url: location.href }]), // PWA 沒有分頁概念，回傳目前頁面
    create: (opts) => window.open(opts.url, '_blank'),
    reload: () => location.reload()
  },
  runtime: {
    sendMessage: () => {},
    onMessage: { addListener: () => {} }
  }
};
// 底下整份程式碼歷史上都是呼叫「chrome.xxx」，這裡用 var 在函式作用域外重新指向我們的 shim
// 用 var 而非 const/let，因為瀏覽器原生 window.chrome 是用其他方式定義的，var 重新賦值不會撞名衝突
var chrome = window.chromeShim;

// =============================================================
//  Constants
// =============================================================
const CC    = { 景點:'t-teal', 交通:'t-purple', 住宿:'t-blue', 餐廳:'t-coral', 購物:'t-amber', 其他:'t-gray' };
const DUR   = { 30:'30分', 60:'1小時', 90:'1.5小時', 120:'2小時', 180:'3小時', 240:'3小時+' };
const WKDAY = ['日','一','二','三','四','五','六'];

const IC = {
  close:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  grip:      '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity:.65"><circle cx="9" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="15" cy="19" r="2"/></svg>',
  pin:       '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  link:      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  people:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  plane:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  mapIcon:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
  star:      '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  calendar:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  share:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  clipboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  sheet:     '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  download:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  pinSmall:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>',
  plus:      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  checkCircle: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  party:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="M22 13l-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="M11 2l.33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
  flag:      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>',
  heart:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  clock:     '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  walk:      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="13" cy="4" r="1.6"/><path d="M13 7v5l-2 9"/><path d="M13 12l3 9"/><path d="M13 8.5L9.5 11 8 14"/><path d="M13 9l3.5 2 2.5.5"/></svg>',
  train:     '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="3" width="16" height="13" rx="2"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="8" y1="19" x2="6" y2="22"/><line x1="16" y1="19" x2="18" y2="22"/><circle cx="8.5" cy="13.5" r=".6" fill="currentColor"/><circle cx="15.5" cy="13.5" r=".6" fill="currentColor"/></svg>',
  car:       '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3v-4l2-5h14l2 5v4h-2"/><path d="M7 17h10"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  compass:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  bed:       '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>',
};

// ── 準備清單常數 ──────────────────────────────────────────────────────────────
const CL_CATS = ['交通','住宿','網路','票券','個人','其他'];

const DEFAULT_TASKS = {
  'def_flight':  { name:'預訂來回機票',             category:'交通', isCustom:false, isChecked:false, note:'', link:'https://tw.trip.com/',    order:1000, createdAt:1 },
  'def_hotel':   { name:'確認住宿預訂',             category:'住宿', isCustom:false, isChecked:false, note:'', link:'https://www.agoda.com/',  order:2000, createdAt:2 },
  'def_esim':    { name:'購買網卡 / eSIM',          category:'網路', isCustom:false, isChecked:false, note:'', link:'https://www.kkday.com/',  order:3000, createdAt:3 },
  'def_tickets': { name:'購買當地交通票券或行程',     category:'票券', isCustom:false, isChecked:false, note:'', link:'https://www.klook.com/', order:4000, createdAt:4 },
};

function buildDefaultChecklistPayload() {
  return JSON.parse(JSON.stringify(DEFAULT_TASKS));
}

// Checklist state
let _clCache = {};   // { [projectId]: { [taskId]: taskObj } }
let _clLock  = {};   // { [taskId]: true }  debounce guard


// =============================================================
//  State
// =============================================================
let db  = { projects: [], wishlist: {}, trips: {} };
let ap  = null;   // active project id
let at  = 'home'; // active tab
let eid = null;   // editing id
let sc  = '#2d6a4f'; // selected color
let pending      = null;
let schedWishId  = null;
let currentDayIdx = 0;
let weatherByDate = {};   // { 'YYYY-MM-DD': { code, t } } 由 Open-Meteo 取得
let weatherFetchKey = ''; // 避免同一區間重複請求
let pendingProjObj = null;
let routeTrips   = [];
let routeMode    = 'driving';
let multiSchedIds = [];
let undoState     = null;  // { type:'wish'|'trip', data, ap }
let undoTimer     = null;
let delProjTarget = null;  // 待刪除的專案 id
let wishFilter    = { cat: 'all', sortField: 'rating', sortDir: 'desc', query: '' };

// =============================================================
//  Utilities
// =============================================================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function $(id)       { return document.getElementById(id); }
function on(id, ev, fn) { const el = $(id); if (el) el.addEventListener(ev, fn); }

// One-shot contextual hint bubble. Shows once per key (persisted), max one per session.
let _hintShownThisSession = false;
function showHintOnce(key, anchorSel, text) {
  if (_hintShownThisSession || tourActive) return;   // 導覽進行中不出提示，避免畫面互疊
  const anchor = document.querySelector(anchorSel);
  if (!anchor) return;
  const storeKey = 'hint:' + key;
  if (!localStorage.getItem(storeKey)) {
    localStorage.setItem(storeKey, '1');
    _hintShownThisSession = true;
    const b = document.createElement('div');
    b.className = 'ctx-hint';
    b.dataset.hintKey = key;
    b.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z"/></svg> ${text} <button class="ctx-hint-ok">知道了</button>`;
    document.body.appendChild(b);
    const r = anchor.getBoundingClientRect();
    b.style.top = Math.max(8, r.top - b.offsetHeight - 8) + 'px';
    b.style.left = Math.min(Math.max(8, r.left), window.innerWidth - b.offsetWidth - 8) + 'px';
    const dismiss = () => b.remove();
    b.querySelector('.ctx-hint-ok').addEventListener('click', dismiss);
    setTimeout(dismiss, 12000);
  }
}
// 導覽開始時收掉畫面上的情境提示；restore=true 時歸還 storage 鍵，之後仍有機會再顯示
function dismissCtxHints(restore) {
  document.querySelectorAll('.ctx-hint').forEach(b => {
    if (restore && b.dataset.hintKey) localStorage.removeItem('hint:' + b.dataset.hintKey);
    b.remove();
  });
}
// 地圖連結：無 mapUrl 的純名稱項目改用 Google Maps 名稱搜尋，讓「地圖」按鈕永遠可用
function itemMapUrl(mapUrl, name) {
  return mapUrl || (name ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}` : '');
}
// 地點名稱正規化，用於重複判斷（與 Extension 的 normName 一致）
function normName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function showUndoToast(msg, onUndo) {
  if (undoTimer) { clearTimeout(undoTimer); commitUndo(); }
  const ut = $('undo-toast');
  $('undo-toast-msg').textContent = msg;
  ut.classList.add('show');
  const btn = $('undo-toast-btn');
  btn.onclick = () => { clearTimeout(undoTimer); ut.classList.remove('show'); undoState = null; onUndo(); };
  undoTimer = setTimeout(() => { ut.classList.remove('show'); commitUndo(); }, 5000);
}

function commitUndo() {
  undoTimer = null;
  undoState = null;
}

// =============================================================
//  Date helpers  ← 統一入口，消除重複
// =============================================================

/**
 * 給定 startDate / endDate（YYYY-MM-DD），回傳該範圍內每天字串的陣列。
 * 這是 getTripDays 和 buildDaySet 共用的底層函式。
 */
function iterateDays(startDate, endDate) {
  const days = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  let d   = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (d <= end) {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${mo}-${dd}`);
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return days;
}

function getTripDays() {
  const p = db.projects.find(x => x.id === ap);
  if (!p || !p.startDate || !p.endDate) return [];
  return iterateDays(p.startDate, p.endDate);
}

function buildDaySet(startDate, endDate) {
  return new Set(iterateDays(startDate, endDate));
}

function fmtDayLabel(dateStr, idx, total) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日（週${WKDAY[dt.getDay()]}） Day ${idx + 1}／${total}`;
}

// 排序某天的行程（order → time → 末尾）
function sortedDayTrips(dateStr) {
  return (db.trips[ap] || []).filter(t => t.date === dateStr).sort((a, b) => {
    if (a.order != null && b.order != null) return a.order - b.order;
    if (a.order != null) return -1;
    if (b.order != null) return 1;
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time > b.time ? 1 : -1;
  });
}

// =============================================================
//  Heart toggle  ← single-heart (rating >= 4 = lit, toggle 0/5)
// =============================================================

function buildHeartHtml(containerClass, wishId, rating) {
  const lit = rating >= 4;
  return `<span class="${containerClass} fav-heart ${lit ? 'lit' : 'unlit'}" data-wish-id="${wishId}" data-fav="${lit ? '1' : '0'}">♥</span>`;
}

function bindHearts(container, cssClass, onToggle) {
  container.querySelectorAll(`.${cssClass}`).forEach(heart => {
    heart.addEventListener('click', async (e) => {
      e.stopPropagation();
      const wishId = heart.dataset.wishId;
      const currentlyLit = heart.dataset.fav === '1';
      const newRating = currentlyLit ? 0 : 5;
      heart.dataset.fav = currentlyLit ? '0' : '1';
      heart.classList.toggle('lit', !currentlyLit);
      heart.classList.toggle('unlit', currentlyLit);
      if (onToggle) await onToggle(wishId, newRating);
    });
  });
}

// =============================================================
//  DB
// =============================================================
async function loadDB() {
  await restoreAuth();
  const user = getCurrentUser();

  if (!user) {
    // 未登入：顯示登入閘門，不載入任何行程資料
    showLoginGate();
    return;
  }

  // 已登入：資料只從雲端讀取，雲端是唯一真相來源
  showApp();
  const cloudData = await fbRead();
  if (cloudData && cloudData.projects) {
    db = cloudData;
    if (!db.wishlist) db.wishlist = {};
    if (!db.trips) db.trips = {};
  } else {
    // 雲端目前沒有資料（新帳號）→ 維持空白的 db，等使用者建立第一個專案
    db = { projects: [], wishlist: {}, trips: {} };
  }

  const r = await chrome.storage.local.get(['onboardDone', 'openCount', 'activeProject']);
  if (r.activeProject && db.projects.some(p => p.id === r.activeProject)) ap = r.activeProject;
  else if (db.projects.length && !ap) ap = db.projects[0].id;

  renderAll();
  showTab('home');
  console.log('[loadDB] 確認登入狀態:', user ? user.email : '未登入', '即將呼叫 updateAuthUI');
  updateAuthUI(user);

  // Start real-time sync for the active project
  if (ap) { startWishlistSync(ap); startTripsSync(ap); startLodgingSync(ap); }

  // Opportunistic cleanup of expired invite codes (fire-and-forget)
  cleanupExpiredInvites();

  if (!db.projects.length && !localStorage.getItem('tourDone')) {
    // 全新使用者：跑首次任務流程（含建立專案），取代 m-onboard 靜態說明
    setTimeout(() => startTour(PWA_FIRST_RUN_STEPS), 500);
  } else if (!db.projects.length) {
    $('first-run-tip').classList.add('show');
  } else if (!localStorage.getItem('tourDone')) {
    // 已有資料（例如電腦端先建好、或受邀加入）：不自動播，靠情境提示與章節手冊
    localStorage.setItem('tourDone', '1');
  }

  const openCount = (r.openCount || 0) + 1;
  chrome.storage.local.set({ openCount });
}

// ── 準備清單共用渲染邏輯 ──────────────────────────────────────────────────────
async function clLoad(pid, container) {
  if (!container) return;

  const cached = _clCache[pid];
  const cacheValid = cached && typeof cached === 'object' && Object.keys(cached).length > 0
    && Object.values(cached).every(t => t && typeof t.name === 'string');

  if (!cacheValid) {
    let data = null;
    try { data = await window.clApiRead(pid); } catch(e) {}

    const remoteValid = data && typeof data === 'object' && Object.keys(data).length > 0
      && Object.values(data).every(t => t && typeof t.name === 'string');

    if (!remoteValid) {
      data = buildDefaultChecklistPayload();
      window.clApiPut(pid, data).catch(e => console.warn('clLoad PUT failed', e));
    }
    _clCache[pid] = data;
  }
  clRender(pid, container);
}

function clUpdateProgress(pid) {
  const tasks = Object.values(_clCache[pid] || {});
  const total = tasks.length, done = tasks.filter(t => t.isChecked).length;
  const lbl = document.getElementById('cl-prog-label');
  const fill = document.getElementById('cl-prog-fill');
  if (lbl) lbl.textContent = `${done}/${total}`;
  if (fill) fill.style.width = total ? `${Math.round(done/total*100)}%` : '0%';
}

function clRender(pid, container) {
  clUpdateProgress(pid);
  const tasks = _clCache[pid] || {};

  const allItems = [];
  Object.entries(tasks).forEach(([id, t]) => {
    if (!t || typeof t.name !== 'string') return;
    allItems.push({id, ...t});
  });
  allItems.sort((a,b) => (a.order??a.createdAt??0)-(b.order??b.createdAt??0));

  // Filter toggle state
  if (!window._clFilterUnchecked) window._clFilterUnchecked = false;
  const displayItems = window._clFilterUnchecked ? allItems.filter(i => !i.isChecked) : allItems;

  let html = `<div class="cl-filter-bar">
    <button class="cl-filter-btn ${window._clFilterUnchecked ? 'active' : ''}" id="cl-toggle-filter">
      ${window._clFilterUnchecked ? '✓ 僅顯示未完成' : '僅顯示未完成'}
    </button>
  </div>`;

  // Flat list — all items in one group, sorted globally by order/createdAt
  html += `<div class="cl-group" data-cat="all">`;
  displayItems.forEach(item => {
    const linkHtml = item.link
      ? `<a class="cl-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer" title="${esc(item.link)}">前往 ↗</a>`
      : '';
    let actionHtml = '';
    actionHtml += `<button class="ib cl-note-btn" data-cid="${esc(item.id)}" title="備註"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
    if (item.isCustom) {
      actionHtml += `<button class="ib del cl-del" data-cid="${esc(item.id)}" title="刪除"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`;
    }
    const notePreview = item.note ? `<div class="cl-note-preview">${esc(item.note)}</div>` : '';
    html += `
      <div class="cl-item${item.isChecked?' cl-done':''}" data-cid="${esc(item.id)}">
        <div class="cl-row">
          <span class="drag-handle" title="拖曳排序"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity:.45"><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg></span>
          <label class="cl-lbl">
            <input type="checkbox" class="cl-chk" data-cid="${esc(item.id)}"${item.isChecked?' checked':''}>
            <span class="cl-name">${esc(item.name)}</span>${linkHtml}<span class="cl-cat-tag" data-cid="${esc(item.id)}">${esc(item.category || '其他')}</span>
          </label>
          <div class="cl-acts">${actionHtml}</div>
        </div>
        ${notePreview}
        <div class="cl-note-wrap" id="cl-nw-${esc(item.id)}" style="display:none">
          <textarea class="cl-ta" data-cid="${esc(item.id)}" placeholder="備註…" rows="2">${esc(item.note||'')}</textarea>
          <button class="cl-save-note" data-cid="${esc(item.id)}">儲存</button>
        </div>
      </div>`;
  });
  html += `</div>`;

  const catOpts = CL_CATS.map(c=>`<option value="${c}">${c}</option>`).join('');
  html += `<div class="cl-add-row">
    <select class="cl-cat-sel" id="cl-cat-sel">${catOpts}</select>
    <input type="text" class="cl-new-inp" id="cl-new-inp" placeholder="新增項目…" maxlength="50">
    <button class="cl-add-btn" id="cl-add-btn">+</button>
  </div>`;

  container.innerHTML = html;
  clBind(pid, container);
}



function clBind(pid, container) {
  // ── filter toggle ────────────────────────────────────────────────────────
  const filterBtn = container.querySelector('#cl-toggle-filter');
  if (filterBtn) {
    filterBtn.addEventListener('click', () => {
      window._clFilterUnchecked = !window._clFilterUnchecked;
      clRender(pid, container);
    });
  }

  // ── checkbox toggle ───────────────────────────────────────────────────────
  container.querySelectorAll('.cl-chk').forEach(cb => {
    cb.addEventListener('change', async () => {
      const cid = cb.dataset.cid;
      if (_clLock[cid]) { cb.checked = !cb.checked; return; }
      _clLock[cid] = true;
      const newVal = cb.checked;
      const row = container.querySelector(`.cl-item[data-cid="${cid}"]`);
      if (row) row.classList.toggle('cl-done', newVal);
      if (_clCache[pid][cid]) _clCache[pid][cid].isChecked = newVal;
      clUpdateProgress(pid);
      const ok = await window.clApiPatch(pid, { [`${cid}/isChecked`]: newVal });
      if (!ok) {
        cb.checked = !newVal;
        if (row) row.classList.toggle('cl-done', !newVal);
        if (_clCache[pid][cid]) _clCache[pid][cid].isChecked = !newVal;
        clUpdateProgress(pid);
        showToast('⚠️ 更新失敗');
      }
      delete _clLock[cid];
    });
  });

  // ── note toggle ───────────────────────────────────────────────────────────
  container.querySelectorAll('.cl-note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid  = btn.dataset.cid;
      const wrap = document.getElementById(`cl-nw-${cid}`);
      if (!wrap) return;
      const open = wrap.style.display !== 'none';
      wrap.style.display = open ? 'none' : 'block';
      if (!open) wrap.querySelector('textarea')?.focus();
    });
  });

  // ── save note ─────────────────────────────────────────────────────────────
  container.querySelectorAll('.cl-save-note').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid  = btn.dataset.cid;
      const wrap = document.getElementById(`cl-nw-${cid}`);
      const ta   = wrap?.querySelector('textarea');
      if (!ta) return;
      const note = ta.value;
      if (_clCache[pid][cid]) _clCache[pid][cid].note = note;
      const itemEl = container.querySelector(`.cl-item[data-cid="${cid}"]`);
      if (itemEl) {
        let prev = itemEl.querySelector('.cl-note-preview');
        if (note) {
          if (!prev) { prev = document.createElement('div'); prev.className='cl-note-preview'; itemEl.querySelector('.cl-row').after(prev); }
          prev.textContent = note;
        } else if (prev) { prev.remove(); }
      }
      wrap.style.display = 'none';
      const ok = await window.clApiPatch(pid, { [`${cid}/note`]: note });
      if (!ok) showToast('⚠️ 備註儲存失敗');
    });
  });

  // ── delete custom item ────────────────────────────────────────────────────
  container.querySelectorAll('.cl-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cid = btn.dataset.cid;
      if (!await showConfirm('確定刪除？')) return;
      const ok = await window.clApiDelete(pid, cid);
      if (ok) { delete _clCache[pid][cid]; clRender(pid, container); }
      else showToast('⚠️ 刪除失敗');
    });
  });

  // ── add custom item ───────────────────────────────────────────────────────
  const addBtn = container.querySelector('#cl-add-btn');
  const addInp = container.querySelector('#cl-new-inp');
  const catSel = container.querySelector('#cl-cat-sel');
  const doAdd  = async () => {
    const name = (addInp?.value||'').trim();
    if (!name) { addInp?.focus(); return; }
    const cat    = catSel?.value || '其他';
    const now    = Date.now();
    const cid    = `custom_${now}`;
    // order: put at end of its category by using max existing order + 1000
    const catItems = Object.values(_clCache[pid]).filter(t => (t.category||'其他') === cat);
    const maxOrder = catItems.length ? Math.max(...catItems.map(t => t.order??0)) : 0;
    const payload  = { name, category:cat, isChecked:false, isCustom:true, note:'', order:maxOrder+1000, createdAt:now };
    if (addInp) addInp.value = '';
    _clCache[pid][cid] = payload;
    clRender(pid, container);
    const ok = await window.clApiPatch(pid, { [cid]: payload });
    if (!ok) { delete _clCache[pid][cid]; clRender(pid, container); showToast('⚠️ 新增失敗'); }
  };
  if (addBtn) addBtn.addEventListener('click', doAdd);
  if (addInp) addInp.addEventListener('keydown', e => { if (e.key==='Enter') doAdd(); });

  // ── Category tag click-to-edit ────────────────────────────────────────────
  container.querySelectorAll('.cl-cat-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const cid = tag.dataset.cid;
      const sel = document.createElement('select');
      sel.className = 'cl-cat-sel-inline';
      CL_CATS.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        if (c === tag.textContent.trim()) opt.selected = true;
        sel.appendChild(opt);
      });
      tag.replaceWith(sel);
      sel.focus();
      const finish = async () => {
        const newCat = sel.value;
        const newTag = document.createElement('span');
        newTag.className = 'cl-cat-tag';
        newTag.dataset.cid = cid;
        newTag.textContent = newCat;
        sel.replaceWith(newTag);
        if (_clCache[pid][cid]) _clCache[pid][cid].category = newCat;
        await window.clApiPatch(pid, { [`${cid}/category`]: newCat });
      };
      sel.addEventListener('change', finish);
      sel.addEventListener('blur', finish);
    });
  });

  // ── Drag-and-Drop (Ghost + Overlay — no layout push) ─────────────────────
  container.querySelectorAll('.cl-group').forEach(group => {
    let ghost = null, sourceItem = null, targetItem = null;

    function start(item, x, y) {
      sourceItem = item;
      ghost = item.cloneNode(true);
      ghost.className = 'drag-ghost cl-ghost';
      ghost.style.width = item.offsetWidth + 'px';
      ghost.style.left = (x - item.offsetWidth / 2) + 'px';
      ghost.style.top = (y - 16) + 'px';
      document.body.appendChild(ghost);
      item.style.visibility = 'hidden';
    }

    function move(x, y) {
      if (!ghost) return;
      ghost.style.left = (x - ghost.offsetWidth / 2) + 'px';
      ghost.style.top = (y - 16) + 'px';
      ghost.style.display = 'none';
      const el = document.elementFromPoint(x, y);
      ghost.style.display = '';
      const over = el?.closest('.cl-item');
      if (over && over !== sourceItem && over.closest('.cl-group') === group) {
        if (targetItem && targetItem !== over) targetItem.classList.remove('drag-target');
        targetItem = over;
        targetItem.classList.add('drag-target');
      } else {
        if (targetItem) { targetItem.classList.remove('drag-target'); targetItem = null; }
      }
    }

    function end() {
      if (!ghost) return;
      ghost.remove(); ghost = null;
      sourceItem.style.visibility = '';
      if (targetItem) {
        targetItem.classList.remove('drag-target');
        const items = [...group.querySelectorAll('.cl-item')];
        const fromIdx = items.indexOf(sourceItem);
        const toIdx = items.indexOf(targetItem);
        if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
          if (fromIdx < toIdx) targetItem.insertAdjacentElement('afterend', sourceItem);
          else group.insertBefore(sourceItem, targetItem);
        }
      }
      sourceItem = null; targetItem = null;
      clPersistOrder(pid, group, window.clApiPatch);
    }

    // Bind mouse + touch to drag-handle (and cl-lbl for horizontal expansion)
    group.querySelectorAll('.drag-handle').forEach(handle => {
      // Mouse
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const item = handle.closest('.cl-item');
        if (!item) return;
        e.preventDefault();
        start(item, e.clientX, e.clientY);
        const onMove = ev => { ev.preventDefault(); move(ev.clientX, ev.clientY); };
        const onUp = () => { end(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      // Touch
      handle.addEventListener('touchstart', e => {
        const item = handle.closest('.cl-item');
        if (!item) return;
        const t = e.touches[0];
        start(item, t.clientX, t.clientY);
      }, { passive: true });
      handle.addEventListener('touchmove', e => {
        if (!ghost) return;
        e.preventDefault();
        const t = e.touches[0];
        move(t.clientX, t.clientY);
      }, { passive: false });
      handle.addEventListener('touchend', () => end());
    });
  });
}


function clPersistOrder(pid, groupEl, patchFn) {
  const items = [...groupEl.querySelectorAll('.cl-item')];
  const patchData = {};
  items.forEach((el, idx) => {
    const cid   = el.dataset.cid;
    const order = (idx + 1) * 1000;
    if (_clCache[pid][cid]) _clCache[pid][cid].order = order;
    patchData[`${cid}/order`] = order;
  });
  // Optimistic update done (cache already mutated); fire PATCH async
  (typeof patchFn === 'function' ? patchFn : window.clApiPatch)(pid, patchData)
    .catch(e => console.warn('clPersistOrder PATCH failed', e));
}

function clClearCache(pid) { delete _clCache[pid]; }

async function saveDB() {
  // 雲端是唯一真相來源，不再寫本地的 tripdb
  // （未登入時不可能呼叫到這裡，因為畫面被登入閘門擋住了）
  await fbWrite(db);
}

// ── 登入閘門：未登入時顯示，鎖住主畫面 ──
function showLoginGate() {
  $('login-gate').style.display = 'flex';
  $('app').style.display = 'none';
  const statusEl = $('login-gate-status');
  if (statusEl && window.lastAuthError) {
    statusEl.textContent = '上次登入發生問題：' + window.lastAuthError;
  }
}

function showApp() {
  $('login-gate').style.display = 'none';
  $('app').style.display = '';
}

// =============================================================
//  Onboarding
// =============================================================
function dismissOnboard(startNew = false) {
  $('m-onboard').classList.remove('open');
  chrome.storage.local.set({ onboardDone: true });
  if (startNew) openNewProj();
}

function updateFirstRunTip() {
  const tip = $('first-run-tip');
  if (!tip) return;
  tip.classList.toggle('show', !db.projects.length);
}

// =============================================================
//  Banner
// =============================================================
function showBanner() {
  if (!pending || !pending.name) return;
  $('mb-name').textContent = pending.name;
  $('maps-banner').classList.add('show');
}
function hideBanner() { $('maps-banner').classList.remove('show'); }

// =============================================================
//  Render root
// =============================================================
function renderAll() {
  renderDD();
  renderHdrDot();
  if (at === 'home')       renderHome();
  else if (at === 'wish')     renderWish();
  else if (at === 'timeline') renderTimeline();
}

function renderHdrDot() {
  const p = db.projects.find(x => x.id === ap);
  const color = p ? (p.color || '#2d6a4f') : 'var(--accent)';
  $('proj-name').textContent      = p ? p.name : '選擇專案';
  $('hdr-dot').style.background   = color;
}

// ── 專案下拉（事件委派，避免每次 render 重複綁定）──
function renderDD() {
  const el = $('dd');
  const hasProjects = db.projects.length > 0;
  const shareDisabled = !hasProjects ? 'style="flex:1;justify-content:center;background:var(--surface);opacity:0.4;pointer-events:none"' : 'style="flex:1;justify-content:center;background:var(--surface)"';

  const projectRows = hasProjects ? db.projects.map(p => `
      <div class="pi ${p.id === ap ? 'active' : ''}" data-proj="${p.id}">
        <div class="pdot" style="background:${p.color || '#2d6a4f'}"></div>
        <div class="pinfo">
          <div class="pn">${esc(p.name)}</div>
          <div class="pm">${esc(p.destination || '')}${p.startDate ? ' · ' + p.startDate : ''}${p.endDate ? '～' + p.endDate : ''}</div>
        </div>
        <button class="pedit" data-edit-proj="${p.id}" title="編輯">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="pdel" data-del-proj="${p.id}" title="刪除">${IC.close}</button>
      </div>`).join('') : '';

  const footer = `
    <div class="pi-footer" style="display:flex;gap:1px;background:var(--border);border-top:1px solid var(--border);margin-top:${hasProjects ? '4px' : '0'}">
      <div class="pi-action-row" id="dd-add-proj" style="flex:1;justify-content:center;background:var(--surface)">
        <span class="pi-action-icon">${IC.plus}</span>
        <span>新增旅遊</span>
      </div>
      <div class="pi-action-row" id="dd-share-proj" ${shareDisabled}>
        <span class="pi-action-icon">${IC.share}</span>
        <span>邀請旅遊</span>
      </div>
      <div class="pi-action-row" id="dd-join-proj" style="flex:1;justify-content:center;background:var(--surface)">
        <span class="pi-action-icon">${IC.people}</span>
        <span>加入旅遊</span>
      </div>
    </div>`;

  el.innerHTML = projectRows + footer;

  // Event delegation: bind once, skip if already bound
  if (el._ddBound) return;
  el.addEventListener('click', e => {
    const delBtn   = e.target.closest('.pdel');
    const editBtn  = e.target.closest('.pedit');
    const addBtn   = e.target.closest('#dd-add-proj');
    const shareRow = e.target.closest('#dd-share-proj');
    const joinRow  = e.target.closest('#dd-join-proj');
    const row      = e.target.closest('.pi');
    if (delBtn)        { e.stopPropagation(); delProj(delBtn.dataset.delProj); }
    else if (shareRow) { closeDD(); openInviteModal(); }
    else if (editBtn)  { e.stopPropagation(); editProj(editBtn.dataset.editProj); }
    else if (joinRow)  { closeDD(); openJoinModal(); }
    else if (addBtn)   { closeDD(); openNewProj(); }
    else if (row)      { selProj(row.dataset.proj); }
  });
  el._ddBound = true;
}

// =============================================================
//  Home tab
// =============================================================
function renderHome() {
  const p  = db.projects.find(x => x.id === ap);
  const el = $('pg-home');
  if (!p) {
    el.innerHTML = `<div class="empty"><div class="ei">${IC.plane}</div><p>點右上角 + 新增你的<br>第一個旅遊專案</p></div>`;
    return;
  }

  // 與 renderWish 的範例隱藏規則一致：有真實地點時不把範例算進數字
  const _wishArr = db.wishlist[ap] || [];
  const wishes  = _wishArr.some(w => w && w.name && w.id !== '_tour_sample')
    ? _wishArr.filter(w => w.id !== '_tour_sample').length
    : _wishArr.length;
  const trips   = (db.trips[ap]   || []).length;

  // 新手起手卡：三步驟引導，收集與排程都完成後自動消失（範例資料不算數）
  const _realWish = _wishArr.some(w => w && w.name && w.id !== '_tour_sample');
  const _realTrip = (db.trips[ap] || []).some(t => t && t.id !== '_sample_trip' && t.id !== '_tour_sample_trip');
  let starterHtml = '';
  if (!_realWish || !_realTrip) {
    const _stepRow = (done, n, label, hint, goto) => `<div class="starter-step${done ? ' done' : ''}"${!done && goto ? ` data-starter-goto="${goto}"` : ''}><span class="ss-badge">${done ? '✓' : n}</span><span class="ss-body"><span class="ss-label">${label}</span><span class="ss-hint">${hint}</span></span>${!done && goto ? '<span class="ss-arrow">›</span>' : ''}</div>`;
    starterHtml = `<div class="starter-card">
      <div class="starter-title">三步驟開始規劃</div>
      ${_stepRow(true, 1, '建立旅遊專案', '完成！日期與成員都可隨時調整', '')}
      ${_stepRow(_realWish, 2, '收集想去的地點', '用新增多地點，或在地點清單手動新增', 'wish')}
      ${_stepRow(_realTrip, 3, '排入每日行程', '在地點清單勾選地點，按「加入行程」選日期', _realWish ? 'timeline' : 'wish')}
    </div>`;
  }
  const allDays = getTripDays();
  const fmtDate = d => { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${y}/${m}/${dd}`; };
  const dateStr = p.startDate ? `${fmtDate(p.startDate)} ～ ${fmtDate(p.endDate)}` : '';

  let countdownHtml = '';
  if (p.startDate) {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(p.startDate); start.setHours(0,0,0,0);
    const end_  = p.endDate ? new Date(p.endDate) : null;
    if (end_) end_.setHours(0,0,0,0);
    const diff = Math.round((start - today) / 86400000);
    if (diff > 0)        countdownHtml = `<div class="countdown-badge">${IC.plane} 距出發還有 ${diff} 天</div>`;
    else if (diff === 0) countdownHtml = `<div class="countdown-badge" style="background:var(--coral-l);color:var(--coral)">${IC.party} 今天出發！</div>`;
    else if (end_ && today <= end_) {
      countdownHtml = `<div class="countdown-badge" style="background:var(--blue-l);color:var(--blue)">${IC.pin} 旅途中 Day ${Math.round((today - start)/86400000)+1}</div>`;
    } else if (end_ && today > end_) {
      countdownHtml = `<div class="countdown-badge" style="background:var(--surface2);color:var(--text3)">${IC.checkCircle} 旅程已結束</div>`;
    }
  }

  const memberCount = p.members ? Object.keys(p.members).length : 1;

  // 旅程結束後準備清單已無日常用途 → 預設摺疊，點標題可展開
  let _tripEnded = false;
  if (p.startDate && p.endDate) {
    const _t = new Date(); _t.setHours(0, 0, 0, 0);
    const _e = new Date(p.endDate); _e.setHours(0, 0, 0, 0);
    _tripEnded = _t > _e;
  }
  const _clCollapsed = _tripEnded && !window._clExpanded;

  el.innerHTML = `
    <div style="padding:16px 0 8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div style="font-size:26px;font-weight:700;letter-spacing:-.3px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
        <button class="mem-badge-btn" id="btn-open-members" title="專案成員">${IC.people}<span class="mem-count">${memberCount}</span></button>
      </div>
      ${p.destination?`<div style="font-size:12px;color:var(--text3);margin-bottom:2px">${esc(p.destination)}</div>`:''}
      ${dateStr?`<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${dateStr}</div>`:'<div style="margin-bottom:10px"></div>'}
      ${countdownHtml}
      ${starterHtml}
      <div class="hstats">
        <div class="hstat"><div class="hsv">${allDays.length}</div><div class="hsl">天行程</div></div>
        <div class="hstat hstat-click" data-goto="wish"><div class="hsv">${wishes}</div><div class="hsl">口袋名單</div></div>
        <div class="hstat hstat-click" data-goto="timeline"><div class="hsv">${trips}</div><div class="hsl">已排入</div></div>
      </div>
    </div>
    <div style="border-top:1px solid var(--border);padding-top:10px">
      <div class="cl-hdr-row${_tripEnded ? ' cl-collapsible' : ''}"${_tripEnded ? ' id="cl-hdr-toggle" title="點擊展開／收合"' : ''}>
        <span class="cl-hdr-title">準備清單${_tripEnded ? `<span class="cl-chevron">${_clCollapsed ? '▸' : '▾'}</span>` : ''}</span>
        <span class="cl-hdr-prog" id="cl-prog-label"></span>
      </div>
      <div id="cl-collapse-wrap"${_clCollapsed ? ' style="display:none"' : ''}>
        <div class="cl-prog-track"><div class="cl-prog-fill" id="cl-prog-fill" style="width:0%"></div></div>
        <div id="cl-body"></div>
      </div>
    </div>
`;

  el.querySelectorAll('.hstat-click').forEach(s => s.addEventListener('click', () => showTab(s.dataset.goto)));
  el.querySelectorAll('[data-starter-goto]').forEach(s => s.addEventListener('click', () => showTab(s.dataset.starterGoto)));
  // recap-share 已移除
  const memBtn = el.querySelector('#btn-open-members');
  if (memBtn) memBtn.addEventListener('click', openMembersModal);
  const clToggle = el.querySelector('#cl-hdr-toggle');
  if (clToggle) clToggle.addEventListener('click', () => { window._clExpanded = !window._clExpanded; renderHome(); });
  clLoad(ap, el.querySelector('#cl-body'));
}

// =============================================================
//  Wishlist tab
// =============================================================
function renderWish() {
  // 重渲染前先儲存已勾選的 id，重渲後還原
  const existingChecked = document.querySelectorAll('.wish-check:checked');
  if (existingChecked.length) {
    window._checkedWishIds = new Set([...existingChecked].map(cb => cb.dataset.wishId));
  }
  // 重渲染前記住分類篩選列的橫向滾動位置，重渲後還原（否則每次點選都會被彈回最左邊）
  const existingFilterBar = document.getElementById('wish-filter-bar');
  window._wishFilterScrollLeft = existingFilterBar ? existingFilterBar.scrollLeft : 0;

  const wishes = db.wishlist[ap] || [];
  const el     = $('pg-wish');

  // 取得所有類別
  const allCats = [...new Set(wishes.map(w => w.category))];

  let html = `<div class="pg-sticky-head"><div class="shd"><h2>地點清單</h2><div style="display:flex;gap:6px"><button class="add-btn batch" id="wish-batch-btn">新增多地點</button></div></div>`;

  // 搜尋欄 + 篩選 chips
  html += `<div id="wish-search-row">
    <input id="wish-search" placeholder="搜尋地點…" value="${esc(wishFilter.query)}">
  </div>
  <div id="wish-filter-row">
    <div id="wish-filter-bar">
      <button class="filter-chip ${wishFilter.cat === 'all' ? 'active' : ''}" data-filter-cat="all">全部</button>
      ${allCats.map(c => `<button class="filter-chip ${wishFilter.cat === c ? 'active' : ''}" data-filter-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      <button class="filter-chip ${wishFilter.cat === 'unscheduled' ? 'active' : ''}" data-filter-cat="unscheduled">未排入</button>
    </div>
    <div id="wish-sort-row">
      <select id="wish-sort" style="font-size:11px;padding:0 6px;height:26px;box-sizing:border-box;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer">
        <option value="rating"    ${wishFilter.sortField==='rating'   ?'selected':''}>依收藏</option>
        <option value="name"      ${wishFilter.sortField==='name'     ?'selected':''}>依名稱</option>
        <option value="createdAt" ${wishFilter.sortField==='createdAt'?'selected':''}>依加入時間</option>
      </select>
      <button id="wish-sort-dir" title="切換排序方向" style="font-size:12px;width:26px;height:26px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">${wishFilter.sortDir==='desc'?'↓':'↑'}</button>
    </div>
  </div></div>`;

  if (!wishes.length) {
    el.innerHTML = html + `<div class="empty"><div class="ei">${IC.star}</div><p>還沒有地點<br>在 Google Maps 點底部按鈕加入</p></div>`;
    bindWishControls(el);
    return;
  }

  // 套用搜尋 + 篩選
  let filtered = wishes.filter(w => w && w.name);
  // Hide the tour sample once the user has real places of their own
  if (wishes.some(w => w && w.name && w.id !== '_tour_sample')) {
    filtered = filtered.filter(w => w.id !== '_tour_sample');
  }
  if (wishFilter.query) {
    const q = wishFilter.query.toLowerCase();
    filtered = filtered.filter(w => w.name.toLowerCase().includes(q) || (w.note || '').toLowerCase().includes(q));
  }
  if (wishFilter.cat === 'unscheduled') {
    filtered = filtered.filter(w => !(db.trips[ap] || []).some(t => t.wishId === w.id));
  } else if (wishFilter.cat !== 'all') {
    filtered = filtered.filter(w => w.category === wishFilter.cat);
  }

  // 排序：依據(sortField)決定比較的欄位，方向(sortDir)決定 asc/desc
  const dirMul = wishFilter.sortDir === 'asc' ? 1 : -1;
  if (wishFilter.sortField === 'rating') {
    filtered.sort((a, b) => dirMul * ((a.rating || 0) - (b.rating || 0)));
  } else if (wishFilter.sortField === 'createdAt') {
    filtered.sort((a, b) => dirMul * ((a.createdAt || 0) - (b.createdAt || 0)));
  } else if (wishFilter.sortField === 'name') {
    filtered.sort((a, b) => dirMul * (a.name || '').localeCompare(b.name || '', 'zh-TW'));
  }

  if (!filtered.length) {
    el.innerHTML = html + `<div class="empty" style="padding:24px 0"><div class="ei">🔍</div><p>沒有符合的地點</p></div>`;
    bindWishControls(el);
    return;
  }

  const allDays = getTripDays();
  const cats = [...new Set(filtered.map(w => w.category))];

  cats.forEach(c => {
    html += `<div class="dhd">${c}</div>`;
    filtered.filter(w => w.category === c).forEach(w => {
      const schedTrips = (db.trips[ap] || []).filter(t => t.wishId === w.id);
      const schedDays  = [...new Set(schedTrips.map(t => t.date))].sort();
      const dayLabels  = schedDays.map(d => {
        const idx = allDays.indexOf(d);
        const [, m, dd] = d.split('-').map(Number);
        return idx >= 0 ? `Day ${idx + 1}（${m}/${dd}）` : d;
      });
      const joined = dayLabels.join('、');
      const dayStr = dayLabels.length ? (joined.length > 24 ? joined.slice(0, 24) + '…' : joined) : '';
      const rating = w.rating || 0;
      const heartHtml = buildHeartHtml('wish-heart', w.id, rating);
      const scheduledBadge = dayStr ? `<span class="sched-done-tag">已排 ${dayStr}</span>` : '';

      html += `<div class="card wish-card cat-${CC[w.category] || 't-teal'}" data-wish-id="${w.id}">
        <div class="vc-row1">
          <input type="checkbox" class="wish-check" data-wish-id="${w.id}">
          <span class="vc-name-wrap"><span class="vc-name">${esc(w.name)}</span><span class="tag ${CC[w.category] || 't-teal'}">${esc(w.category)}</span></span>
          ${heartHtml}
          <button class="ib" data-edit-wish="${w.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="ib del" data-del-wish="${w.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
        <div class="vc-row2">
          ${(() => { const u = itemMapUrl(w.mapUrl, w.name); return u ? `<a class="vc-map" href="${esc(u)}" target="_blank">地圖</a><span class="vc-sep">·</span>` : ''; })()}
          <span class="vc-dur">${DUR[w.duration] || w.duration + '分'}</span>
          ${w.address ? `<span class="vc-sep">·</span><span class="vc-addr">${esc(w.address)}</span>` : ''}
          ${scheduledBadge}
        </div>
        <div class="vc-row3">
          ${w.note ? `<span class="vc-note">${esc(w.note)}</span>` : '<span></span>'}
          <button class="sched-btn" data-sched="${w.id}">加入行程</button>
        </div>
      </div>`;
    });
  });

  el.innerHTML = html;

  // 還原重渲染前的勾選狀態
  if (window._checkedWishIds && window._checkedWishIds.size) {
    el.querySelectorAll('.wish-check').forEach(cb => {
      if (window._checkedWishIds.has(cb.dataset.wishId)) cb.checked = true;
    });
  }
  window._checkedWishIds = null;

  bindWishControls(el);

  // Just-in-time contextual hint
  if (wishes.length >= 8) {
    showHintOnce('wish-filter', '.filter-chip', '地點變多了：上方可以按類別篩選，也能搜尋名稱');
  }
}

function bindWishControls(el) {
  // 還原重渲染前的橫向滾動位置，避免每次點選分類/排序都被彈回最左邊。
  // 用 requestAnimationFrame 延遲到下一個畫面更新週期，確保瀏覽器已完成新內容的版面配置，
  // 否則 scrollLeft 賦值可能在容器寬度還沒計算完成前就被忽略。
  const filterBar = $('wish-filter-bar');
  if (filterBar && window._wishFilterScrollLeft !== undefined) {
    requestAnimationFrame(() => { filterBar.scrollLeft = window._wishFilterScrollLeft; });
  }

  // 新增單一地點改由 FAB（#wish-fab，init 時綁定）觸發
  on('wish-batch-btn','click', openBatchImport);

  // 搜尋 — debounce + 中文 IME 支援 + 游標位置還原
  const searchInput = $('wish-search');
  if (searchInput) {
    if (window._wishSearchFocus) {
      const { start, end } = window._wishSearchFocus;
      searchInput.focus();
      try { searchInput.setSelectionRange(start, end); } catch(e) {}
      window._wishSearchFocus = null;
    }
    const _commit = () => {
      if (!document.body.contains(searchInput)) return;
      window._wishSearchFocus = { start: searchInput.selectionStart, end: searchInput.selectionEnd };
      wishFilter.query = searchInput.value;
      renderWish();
    };
    searchInput.addEventListener('input', e => {
      if (e.isComposing) return;
      clearTimeout(window._wishSearchDbc);
      window._wishSearchDbc = setTimeout(_commit, 250);
    });
    searchInput.addEventListener('compositionend', () => {
      clearTimeout(window._wishSearchDbc);
      window._wishSearchDbc = setTimeout(_commit, 100);
    });
  }
  // 篩選 chips
  el.querySelectorAll('[data-filter-cat]').forEach(btn => btn.addEventListener('click', () => {
    wishFilter.cat = btn.dataset.filterCat;
    renderWish();
  }));
  // 排序：依據選單 + 方向切換按鈕
  const sortSel = $('wish-sort');
  if (sortSel) sortSel.addEventListener('change', () => { wishFilter.sortField = sortSel.value; renderWish(); });
  const sortDirBtn = $('wish-sort-dir');
  if (sortDirBtn) sortDirBtn.addEventListener('click', () => {
    wishFilter.sortDir = wishFilter.sortDir === 'asc' ? 'desc' : 'asc';
    renderWish();
  });

  el.querySelectorAll('[data-edit-wish]').forEach(b => b.addEventListener('click', () => editWish(b.dataset.editWish)));
  el.querySelectorAll('[data-del-wish]').forEach(b  => b.addEventListener('click', () => delWish(b.dataset.delWish)));
  el.querySelectorAll('[data-sched]').forEach(b     => b.addEventListener('click', () => openSched(b.dataset.sched)));

  // Heart toggle
  bindHearts(el, 'wish-heart', async (wishId, newRating) => {
    const w = (db.wishlist[ap] || []).find(x => x.id === wishId);
    if (!w) return;
    w.rating = newRating;
    await window.projMerge(ap, `wishlist/${wishId}`, { rating: newRating });
    if (at === 'timeline') renderTimeline();
  });

  // 多選
  function updateMultiBar() {
    const checked = [...el.querySelectorAll('.wish-check:checked')];
    const bar = $('wish-multi-bar');
    if (bar) bar.style.display = checked.length ? 'flex' : 'none';
    // 多選中收起 FAB，避免與工具列重疊
    const fab = $('wish-fab');
    if (fab) fab.classList.toggle('show', !checked.length);
    const lbl = $('wish-sel-label');
    if (lbl) lbl.textContent = `已選 ${checked.length} 個地點`;
  }
  el.querySelectorAll('.wish-check').forEach(cb => cb.addEventListener('change', updateMultiBar));
  on('wish-sel-all',  'click', () => { el.querySelectorAll('.wish-check').forEach(cb => cb.checked = true);  updateMultiBar(); });
  on('wish-sel-clear','click', () => { el.querySelectorAll('.wish-check').forEach(cb => cb.checked = false); updateMultiBar(); });
  on('wish-sel-delete', 'click', delSelectedWishes);
  on('wish-multi-sched-btn', 'click', () => {
    const ids = [...el.querySelectorAll('.wish-check:checked')].map(cb => cb.dataset.wishId);
    openMultiSched(ids);
  });
  // 還原勾選後立即更新工具列
  updateMultiBar();
}

// =============================================================
//  Timeline tab
// =============================================================
let timelineView = 'day'; // 'day' | 'overview'

function renderTimeline() {
  const el   = $('pg-timeline');
  const days = getTripDays();
  if (!days.length) {
    el.innerHTML = `<div class="empty" style="margin-top:20px"><div class="ei">${IC.calendar}</div><p>請先在專案中設定出發與結束日期</p></div>`;
    $('timeline-bar').classList.remove('show');
    return;
  }
  if (currentDayIdx >= days.length) currentDayIdx = 0;
  $('timeline-bar').classList.add('show');

  // 渲染前儲存 mini-date-bar 的 scrollLeft
  const prevScrollLeft = $('mini-date-bar') ? $('mini-date-bar').scrollLeft : 0;

  // 迷你日期欄（所有天）
  fetchWeather(); // 非同步取得天氣，完成後會自動重繪
  const _hasWx = Object.keys(weatherByDate).length > 0;
  const miniBar = days.map((d, i) => {
    const cnt = (db.trips[ap] || []).filter(t => t.date === d).length;
    const [, m, dd] = d.split('-').map(Number);
    const badge = cnt ? `<div class="mini-day-badge">${cnt}</div>` : `<div style="height:14px"></div>`;
    const wx = weatherByDate[d];
    const wxHtml = _hasWx ? `<div class="mdb-wx">${wx ? `${wxEmoji(wx.code)}${wx.t}°` : '·'}</div>` : '';
    return `<button class="mini-day-btn ${i === currentDayIdx && timelineView === 'day' ? 'active' : ''}" data-mini-day="${i}">
      <div class="mdb-d">${m}/${dd}</div>
      ${wxHtml}
      ${badge}
    </button>`;
  }).join('');

  // 全覽 / 單日 切換
  const viewToggle = `<div class="view-toggle">
    <button class="vt-btn ${timelineView==='day'?'active':''}" id="vt-day">單日</button>
    <button class="vt-btn ${timelineView==='overview'?'active':''}" id="vt-overview">全覽</button>
  </div>`;

  const _dayNames = db.projects.find(x => x.id === ap)?.dayNames || {};
  const _activeDateKey = timelineView === 'day' ? days[currentDayIdx] : null;
  const _customName = _activeDateKey ? (_dayNames[_activeDateKey] || '') : '';

  let html = `<div class="pg-sticky-head">
    <div id="mini-date-bar">${miniBar}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 0">
      <div id="date-label-main" style="font-size:12px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px">${timelineView==='overview' ? `全部 ${days.length} 天` : fmtDayLabel(days[currentDayIdx], currentDayIdx, days.length)}${timelineView === 'day' && !_customName ? `<svg id="day-name-add" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="cursor:pointer;flex-shrink:0;color:var(--text3)"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>` : ''}</div>
      ${viewToggle}
    </div>
    ${timelineView === 'day' && _customName ? `<div id="day-name-subtitle">- ${esc(_customName)}</div>` : ''}`;

  if (timelineView === 'overview') {
    $('timeline-bar').classList.remove('show');
    // 全覽模式
    html += `</div><div id="timeline-overview" class="show">`;
    days.forEach((d, i) => {
      const dayTrips = sortedDayTrips(d);
      const [, m, dd] = d.split('-').map(Number);
      const wk = WKDAY[new Date(...d.split('-').map(Number).map((v,j)=>j===1?v-1:v)).getDay()];
      const _ovCustomName = _dayNames[d] ? `<span class="ov-day-name">${esc(_dayNames[d])}</span>` : '';
      const label = `Day ${i+1}  ${m}/${dd}（週${wk}）${_ovCustomName}`;
      const names = dayTrips.map(t => t.name).join('・') || '尚未安排';
      const totalMin = dayTrips.reduce((s, t) => s + (Number(t.duration) || 0), 0);
      const timeStr = totalMin ? `${Math.floor(totalMin/60)}h${totalMin%60?totalMin%60+'m':''}` : '';
      html += `<div class="ov-day" data-ov-idx="${i}">
        <div class="ov-day-hd">
          <div class="ov-day-label">${label}</div>
          <div class="ov-day-count">${dayTrips.length} 個地點${timeStr?' · '+timeStr:''}</div>
        </div>
        <div class="ov-day-spots">${esc(names)}</div>
      </div>`;
    });
    html += `</div>`;
    html += `<div style="height:10px"></div>`;
  } else {
    // 單日模式
    const dateStr  = days[currentDayIdx];
    const dayTrips = sortedDayTrips(dateStr);

    // 每日時間摘要
    const totalMin = dayTrips.reduce((s, t) => s + (Number(t.duration) || 0), 0);
    const _transit = db.projects.find(x => x.id === ap)?.transit || {};
    let transitTotal = 0;
    for (let ti = 1; ti < dayTrips.length; ti++) {
      const info = transitInfo(dayTrips[ti - 1], dayTrips[ti], _transit);
      if (info) transitTotal += info.min;
    }
    // 住宿：早上出發旅館（睡前一晚的）與今晚旅館，及頭尾兩段移動
    const _lodgeAM = morningLodging(dateStr);
    const _lodgePM = eveningLodging(dateStr);
    const _dayLodge = _lodgePM || _lodgeAM;
    const _amSeg = dayTrips.length ? lodgeTransit(_lodgeAM, dayTrips[0]) : null;
    const _pmSeg = dayTrips.length ? lodgeTransit(_lodgePM, dayTrips[dayTrips.length - 1]) : null;
    if (_amSeg) transitTotal += _amSeg.min;
    if (_pmSeg) transitTotal += _pmSeg.min;
    const _visitedCnt = dayTrips.filter(x => x.visited).length;

    // 由出發時間沿停留＋移動推算每站預計抵達；行程自帶 time 者視為錨點重設時間軸
    const _dayStart = (db.projects.find(x => x.id === ap)?.dayStartTimes || {})[dateStr] || '09:00';
    const _toMin = tm => { const [h, m] = String(tm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
    const _toHM  = min => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    const _etas = [];
    let _etaCursor = _toMin(_dayStart);
    dayTrips.forEach((t, ti) => {
      if (ti > 0) { const info = transitInfo(dayTrips[ti - 1], t, _transit); if (info) _etaCursor += info.min; }
      else if (_amSeg) _etaCursor += _amSeg.min;
      if (t.time) _etaCursor = _toMin(t.time);
      _etas.push(_toHM(_etaCursor));
      _etaCursor += Number(t.duration) || 0;
    });
    const _pmArrive = _pmSeg ? _toHM(_etaCursor + _pmSeg.min) : '';

    // 提案A：出發時間＋統計＋動作鈕合併成單一工具列（原標題列已移除）
    const _actionBtns = `<div class="dts-actions">${dayTrips.length ? `<button class="ib" id="share-day-btn" title="分享今日行程"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button><button class="ib" id="move-day-btn" title="整天移至其他日期"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M10 14l3 3-3 3"/></svg></button>` : ''}<button class="add-btn" id="timeline-add-btn" title="從地點清單新增">＋ 新增</button></div>`;
    // 單行：出發 chip ＋ 統計文字（過長自動省略）＋ 動作鈕——2026-07-17 精簡提案 b
    const timeSummary = `<div class="day-time-summary" style="padding-bottom:0">${totalMin
      ? `<button class="day-start-chip" id="day-start-btn" title="設定當天出發時間" style="flex-shrink:0">${IC.clock} ${_dayStart}</button>`
      : ''}${totalMin
      ? `<span class="dts-stats" style="flex:1 1 auto;min-width:172px;white-space:nowrap"><span class="hl">${dayTrips.length}</span> 點 · 預計 <span class="hl">${Math.floor(totalMin/60) > 0 ? Math.floor(totalMin/60) + '時' : ''}${totalMin%60 > 0 ? totalMin%60 + '分' : ''}</span>${transitTotal ? ` · 移動 <span class="hl">≈${transitTotal}分</span>` : ''} · 走訪 <span class="hl" id="visit-progress">${_visitedCnt}/${dayTrips.length}</span></span>`
      : ''}${_actionBtns}</div>`;

    // 順路排序:試算 nearest-neighbor,只有省 >20 分且 >15% 才提示;dismiss 記地點數,新增時再提示
    const _canOpt = dayTrips.length >= 3 && dayTrips.every(t => tripCoords(t));
    let _optSavedMin = 0, _optSavedPct = 0;
    if (_canOpt) {
      const _optTotal = computeOptimizedTransitTotal(dayTrips, _transit);
      _optSavedMin = transitTotal - _optTotal;
      _optSavedPct = transitTotal > 0 ? _optSavedMin / transitTotal : 0;
    }
    const _routeDismissAt = Number(localStorage.getItem(`routeHintDismiss:${ap}:${dateStr}`) || 0);
    const _showRouteHint = _optSavedMin > 20 && _optSavedPct > 0.15 && dayTrips.length > _routeDismissAt;
    const routeHint = _showRouteHint
      ? `<div class="route-hint"><span>${IC.compass} 順路排序可省 ≈${_optSavedMin} 分</span><div style="display:flex;gap:6px;align-items:center"><button id="route-opt-btn">一鍵順路排序</button><button id="route-opt-dismiss" title="不再提示，直到新增地點" style="background:none;color:var(--text3);border:1px solid var(--border2);font-weight:500">忽略</button></div></div>`
      : '';

    html += `${timeSummary}${routeHint}</div>`;

    // 住宿列
    const _nights = l => Math.round((new Date(l.checkOut) - new Date(l.checkIn)) / 86400000);
    const _md = s => s.slice(5).replace('-', '/');
    const _lodgeUrl = _dayLodge ? (_dayLodge.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(_dayLodge.name)}`) : '';
    html += _dayLodge
      ? `<div class="lodge-row" id="lodge-row" title="點擊編輯住宿">${IC.bed}<span class="lr-name">${esc(_dayLodge.name)}</span><a class="vc-map" href="${esc(_lodgeUrl)}" target="_blank">地圖</a><span class="lr-meta">${_md(_dayLodge.checkIn)}–${_md(_dayLodge.checkOut)} · ${_nights(_dayLodge)} 晚${_lodgePM && _lodgePM.checkIn === dateStr && _lodgeAM ? ' · 今日入住' : ''}${!_lodgePM && _lodgeAM ? ' · 今日退房' : ''}</span></div>`
      : `<div class="lodge-row lodge-none" id="lodge-row" title="設定這段旅程的住宿"><span style="display:inline-flex;color:var(--text3)">${IC.bed}</span><span class="lr-name">＋ 設定住宿</span></div>`;

    if (!dayTrips.length) {
      html += `<div class="empty" style="padding:24px 0"><div class="ei">${IC.pin}</div><p>今天還沒有行程<br>從地點清單排入</p></div>`;
    } else {
      html += `<div id="trip-list">`;
      if (_amSeg) html += `<div class="transit-row lodge-seg">${_amSeg.mode === 'walk' ? IC.walk : IC.train} 住宿 → ${esc(dayTrips[0].name)} ${_amSeg.min}分</div>`;
      let _lastBucket = '';
      const _todBucket = tm => { const h = parseInt(tm, 10); return h < 12 ? '上午' : h < 17 ? '下午' : '晚上'; };
      dayTrips.forEach((t, ti) => {
        if (t.time) {
          const b = _todBucket(t.time);
          if (b !== _lastBucket) { html += `<div class="tod-divider">${b}</div>`; _lastBucket = b; }
        }
        if (ti > 0) html += transitRowHtml(dayTrips[ti - 1], t, _transit);
        const wishItem = t.wishId ? (db.wishlist[ap] || []).find(x => x.id === t.wishId) : null;
        const rating   = wishItem ? wishItem.rating || 0 : 0;
        const dispCat  = wishItem ? wishItem.category : t.category;
        const dispNote = wishItem ? wishItem.note : t.note;
        const heartHtml = buildHeartHtml('trip-heart', t.wishId || t.id, rating);
        html += `<div class="card trip-card cat-${CC[dispCat] || 't-teal'}${t.visited ? ' visited' : ''}" data-trip-id="${t.id}">
          <div class="vc-row1">
            <div class="drag-handle" title="拖曳排序">${IC.grip}</div>
            <span class="vc-name-wrap"><span class="vc-name">${esc(t.name)}</span><span class="tag ${CC[dispCat] || 't-teal'}">${esc(dispCat)}</span></span>
            <button class="visit-check${t.visited ? ' checked' : ''}" data-visit="${t.id}" title="打卡標記已走訪">✓</button>
            ${heartHtml}
            <button class="ib" data-edit-trip="${t.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="ib del" data-del-trip="${t.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
          <div class="vc-row2">
            ${(() => { const u = itemMapUrl(t.mapUrl || (wishItem && wishItem.mapUrl), t.name); return u ? `<a class="vc-map" href="${esc(u)}" target="_blank">地圖</a><span class="vc-sep">·</span>` : ''; })()}
            ${t.time ? `<span class="vc-eta" title="自訂時間">${IC.clock} ${t.time}</span><span class="vc-sep">·</span>` : `<span class="vc-eta" title="預計抵達（依出發時間推算）">${IC.clock} ${_etas[ti]}</span><span class="vc-sep">·</span>`}
            <span class="vc-dur">${DUR[t.duration] || t.duration + '分'}</span>
            ${(() => { const addr = (wishItem && wishItem.address) || t.address || ''; return addr ? `<span class="vc-sep">·</span><span class="vc-addr">${esc(addr)}</span>` : ''; })()}
          </div>
          <div class="vc-row3">
            ${dispNote ? `<span class="vc-note">${esc(dispNote)}</span>` : '<span></span>'}
          </div>
        </div>`;
      });
      if (_pmSeg) html += `<div class="transit-row lodge-seg">${_pmSeg.mode === 'walk' ? IC.walk : IC.train} 返回住宿 ${_pmSeg.min}分${_pmArrive ? ` · 預計 ${_pmArrive} 抵達` : ''}</div>`;
      html += `</div>
      <button class="add-btn" id="timeline-add-btn-bottom" style="width:100%;justify-content:center;margin-top:6px;background:var(--surface2);color:var(--text);border:1px solid var(--border)">＋ 從地點清單新增</button>`;
    }

    // 晚間回顧提示：當天 20:00 後仍有已走訪未評分的地點時顯示（關閉狀態記錄在 localStorage，不佔 Firebase 寫入額度）
    // reflect-prompt 已移除
  }

  el.innerHTML = html;

  // 還原 scroll 位置（點擊日期時不跳位）
  const bar = $('mini-date-bar');
  if (bar) bar.scrollLeft = prevScrollLeft;

  // 迷你日期欄點擊 → 不額外 scroll，保留用戶當前滑動位置
  el.querySelectorAll('.mini-day-btn').forEach(btn => btn.addEventListener('click', () => {
    currentDayIdx = Number(btn.dataset.miniDay);
    timelineView = 'day';
    renderTimeline();
  }));

  // 全覽模式點擊某天 → 切到單日
  el.querySelectorAll('.ov-day').forEach(d => d.addEventListener('click', () => {
    currentDayIdx = Number(d.dataset.ovIdx);
    timelineView = 'day';
    renderTimeline();
  }));

  // 視圖切換
  on('vt-day', 'click', () => { timelineView = 'day'; renderTimeline(); });
  on('vt-overview', 'click', () => { timelineView = 'overview'; renderTimeline(); });

  // 前一天 / 後一天
  // day-prev/day-next 左右鍵已移除（2026-07-17 Allen）：切天改用上方日期列與左右滑動手勢

  // 當天出發時間（inline 編輯，模式同 editTransit）
  on('day-start-btn', 'click', () => {
    const btn = $('day-start-btn');
    if (!btn || btn.querySelector('input')) return;
    const dateStr = days[currentDayIdx];
    const p = db.projects.find(x => x.id === ap);
    const cur = (p?.dayStartTimes || {})[dateStr] || '09:00';
    btn.innerHTML = `${IC.clock} <input type="time" class="ds-input" value="${cur}"> 出發`;
    const inp = btn.querySelector('input');
    inp.focus();
    const save = async () => {
      const v = inp.value;
      if (v && v !== cur) {
        if (!p.dayStartTimes) p.dayStartTimes = {};
        p.dayStartTimes[dateStr] = v;
        // PWA 的 projPatch 是 PUT（整段覆寫），寫葉節點以免清掉其他天的設定
        await window.projPatch(ap, `dayStartTimes/${dateStr}`, v);
      }
      renderTimeline();
    };
    inp.addEventListener('blur', save, { once: true });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.removeEventListener('blur', save); renderTimeline(); }
    });
  });

  // 一鍵順路排序
  on('route-opt-btn', 'click', () => optimizeDayOrder(days[currentDayIdx]));
  on('route-opt-dismiss', 'click', () => {
    const _d = days[currentDayIdx];
    localStorage.setItem(`routeHintDismiss:${ap}:${_d}`, String(sortedDayTrips(_d).length));
    renderTimeline();
  });

  // 今日主題內聯編輯
  const _openDayNameEdit = (anchor) => {
    const p = db.projects.find(x => x.id === ap);
    const date = days[currentDayIdx];
    const cur = (p?.dayNames || {})[date] || '';
    const inp = document.createElement('input');
    inp.id = 'day-name-input'; inp.maxLength = 10; inp.value = cur;
    inp.placeholder = '今日主題（最多10字）';
    if (anchor.id === 'day-name-subtitle') {
      anchor.replaceWith(inp);
    } else {
      $('date-label-main').parentElement.after(inp);
    }
    inp.focus(); inp.select();
    const save = async () => {
      const val = inp.value.trim().slice(0, 10);
      if (val !== cur) {
        if (val) { await window.projPatch(ap, `dayNames/${date}`, val); if (!p.dayNames) p.dayNames = {}; p.dayNames[date] = val; }
        else { await window.projDelete(ap, `dayNames/${date}`); if (p?.dayNames) delete p.dayNames[date]; }
      }
      renderTimeline();
    };
    inp.addEventListener('blur', save, { once: true });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.removeEventListener('blur', save); renderTimeline(); }
    });
  };
  const _subtitleEl = $('day-name-subtitle');
  if (_subtitleEl) _subtitleEl.addEventListener('click', () => _openDayNameEdit(_subtitleEl));
  const _addIcon = $('day-name-add');
  if (_addIcon) _addIcon.addEventListener('click', () => {
    const label = $('date-label-main');
    if (label) _openDayNameEdit(label);
  });

  on('timeline-add-btn', 'click', () => showTab('wish'));
  on('timeline-add-btn-bottom', 'click', () => showTab('wish'));
  on('move-day-btn', 'click', openMoveDay);
  on('share-day-btn', 'click', shareDay);
  on('lodge-row', 'click', (e) => { if (e.target.closest('a')) return; openLodging(days[currentDayIdx]); });
  // reflect / rp 已移除
  el.querySelectorAll('[data-edit-trip]').forEach(b => b.addEventListener('click', () => editTrip(b.dataset.editTrip)));
  el.querySelectorAll('[data-del-trip]').forEach(b  => b.addEventListener('click', () => delTrip(b.dataset.delTrip)));
  el.querySelectorAll('.tr-mode').forEach(m => m.addEventListener('click', (e) => {
    e.stopPropagation();
    openTransitModeMenu(m.dataset.trMode, m);
  }));
  // 點時間 = 編輯移動時間；點紙飛機 = 開 Google Maps 路線（與 Extension 行為一致）
  el.querySelectorAll('.tr-label[data-tr-key]').forEach(lbl => lbl.addEventListener('click', (e) => {
    e.stopPropagation(); editTransit(lbl.dataset.trKey, lbl);
  }));
  el.querySelectorAll('[data-tr-nav]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const row = b.closest('.transit-row');
    if (row) openTransitDir(row.dataset.from, row.dataset.to, row.dataset.mode);
  }));
  el.querySelectorAll('[data-visit]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation(); toggleVisited(b.dataset.visit, b);
  }));

  // Heart toggle
  bindHearts(el, 'trip-heart', async (wishId, newRating) => {
    const w = (db.wishlist[ap] || []).find(x => x.id === wishId);
    if (!w) return;
    w.rating = newRating;
    await window.projMerge(ap, `wishlist/${wishId}`, { rating: newRating });
    if (at === 'wish') renderWish();
  });

  if ($('trip-list')) initDragSort($('trip-list'), days[currentDayIdx]);

  // Just-in-time contextual hints
  if (document.querySelector('.transit-row')) {
    showHintOnce('transit-edit', '.transit-row', '移動時間可以修改：點分鐘數字，輸入實際查到的時間');
  }
  if (getTripDays().length >= 2 && timelineView === 'day') {
    showHintOnce('swipe-days', '#mini-date-bar', '左右滑動可以切換前後一天');
  }
  if (sortedDayTrips(days[currentDayIdx]).length >= 3) {
    showHintOnce('nav-export', '#btn-nav-route', '行程排好了？「今日路線導航」照順序帶路，「匯出行程」可以分享給旅伴');
  }
}

// active 日期不在可視範圍時，才 scroll 讓它剛好進入邊緣
function scrollActiveDateIntoView() {
  const bar = $('mini-date-bar');
  if (!bar) return;
  const active = bar.querySelector('.mini-day-btn.active');
  if (!active) return;
  const barLeft   = bar.scrollLeft;
  const barRight  = barLeft + bar.clientWidth;
  const btnLeft   = active.offsetLeft;
  const btnRight  = btnLeft + active.offsetWidth;
  const padding   = 8; // 邊緣留一點空間
  if (btnLeft < barLeft + padding) {
    // 按鈕在左邊滑出去了 → scroll 讓它靠左
    bar.scrollTo({ left: btnLeft - padding, behavior: 'smooth' });
  } else if (btnRight > barRight - padding) {
    // 按鈕在右邊滑出去了 → scroll 讓它靠右
    bar.scrollTo({ left: btnRight - bar.clientWidth + padding, behavior: 'smooth' });
  }
  // 在可視範圍內 → 不動
}

// =============================================================
//  Drag sort
// =============================================================
function initDragSort(list, dateStr) {
  let ghost = null, sourceCard = null, targetCard = null;

  function start(card, x, y) {
    sourceCard = card;
    _isDragging = true;
    // Ghost: semi-transparent clone following cursor
    ghost = card.cloneNode(true);
    ghost.className = 'drag-ghost';
    ghost.style.width = card.offsetWidth + 'px';
    ghost.style.left = (x - card.offsetWidth / 2) + 'px';
    ghost.style.top = (y - 20) + 'px';
    document.body.appendChild(ghost);
    // Original: invisible but holds space
    card.style.visibility = 'hidden';
  }

  function move(x, y) {
    if (!ghost) return;
    ghost.style.left = (x - ghost.offsetWidth / 2) + 'px';
    ghost.style.top = (y - 20) + 'px';
    // Hide ghost temporarily to find element underneath
    ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    ghost.style.display = '';
    const over = el?.closest('.trip-card');
    if (over && over !== sourceCard) {
      if (targetCard && targetCard !== over) targetCard.classList.remove('drag-target');
      targetCard = over;
      targetCard.classList.add('drag-target');
    } else {
      if (targetCard) { targetCard.classList.remove('drag-target'); targetCard = null; }
    }
  }

  async function end() {
    if (!ghost) return;
    ghost.remove(); ghost = null;
    sourceCard.style.visibility = '';
    _isDragging = false;
    if (targetCard) {
      targetCard.classList.remove('drag-target');
      const cards = [...list.querySelectorAll('.trip-card')];
      const fromIdx = cards.indexOf(sourceCard);
      const toIdx = cards.indexOf(targetCard);
      if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
        if (fromIdx < toIdx) targetCard.insertAdjacentElement('afterend', sourceCard);
        else list.insertBefore(sourceCard, targetCard);
      }
    }
    sourceCard = null; targetCard = null;
    const newOrder = [...list.querySelectorAll('.trip-card')].map(c => c.dataset.tripId);
    newOrder.forEach((id, i) => { const t = (db.trips[ap] || []).find(x => x.id === id); if (t) t.order = i; });
    await Promise.all(newOrder.map((id, i) => window.projMerge(ap, `trips/${id}`, { order: i })));
  }

  // Bind mouse + touch to drag-handle and vc-name-wrap
  list.querySelectorAll('.trip-card').forEach(card => {
    card.querySelectorAll('.drag-handle, .vc-name-wrap').forEach(handle => {
      // Mouse
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.preventDefault();
        start(card, e.clientX, e.clientY);
        const onMove = ev => { ev.preventDefault(); move(ev.clientX, ev.clientY); };
        const onUp = () => { end(); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      // Touch
      handle.addEventListener('touchstart', e => {
        const t = e.touches[0];
        start(card, t.clientX, t.clientY);
      }, { passive: true });
      handle.addEventListener('touchmove', e => {
        if (!ghost) return;
        e.preventDefault();
        const t = e.touches[0];
        move(t.clientX, t.clientY);
      }, { passive: false });
      handle.addEventListener('touchend', () => end());
    });
  });
}

// =============================================================
//  Route navigation
// =============================================================
function extractWaypoint(t) {
  if (t.mapUrl) {
    const coordMatch = t.mapUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) return `${coordMatch[1]},${coordMatch[2]}`;
    const placeMatch = t.mapUrl.match(/place\/([^/@?]+)/);
    if (placeMatch) return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
  }
  return t.name;
}

function buildDrivingUrl(trips, mode) {
  const wps = trips.map(extractWaypoint);
  if (wps.length === 1) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(wps[0])}&destination=${encodeURIComponent(wps[0])}&travelmode=${mode}`;
  }
  const origin = encodeURIComponent(wps[0]);
  const dest   = encodeURIComponent(wps[wps.length - 1]);
  const stops  = wps.slice(1, -1).map(w => encodeURIComponent(w)).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${stops ? '&waypoints=' + stops : ''}&travelmode=${mode}`;
}

function openRouteNav() {
  const days = getTripDays();
  if (!days.length) return;
  const dateStr = days[currentDayIdx];
  routeTrips = sortedDayTrips(dateStr);   // 統一使用共用函式
  if (!routeTrips.length) { showToast('今天還沒有行程'); return; }

  const [y, m, d] = dateStr.split('-').map(Number);
  const noUrl = routeTrips.filter(t => !t.mapUrl).length;
  const note  = noUrl ? `（${noUrl} 個無地圖連結，將以名稱搜尋）` : '';
  $('route-info').textContent = `${m}月${d}日（週${WKDAY[new Date(y, m - 1, d).getDay()]}）共 ${routeTrips.length} 個地點 ${note}`;

  routeMode = 'driving';
  document.querySelectorAll('.travel-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'driving'));
  renderRouteOpts();
  om('m-route');
}

function renderRouteOpts() {
  const isTransit = routeMode === 'transit';
  $('transit-opts').style.display  = isTransit ? 'block' : 'none';
  $('driving-opts').style.display  = isTransit ? 'none'  : 'block';
  $('btn-open-route').style.display = isTransit ? 'none'  : 'block';

  if (isTransit) {
    const validTrips  = routeTrips.filter(t => t.mapUrl);
    const skipped     = routeTrips.filter(t => !t.mapUrl);
    if (!validTrips.length) {
      $('transit-links').innerHTML = '<div style="font-size:12px;color:var(--text3);padding:6px 0">所選地點皆缺少 Google Maps 連結，無法產生路線</div>';
      return;
    }
    const links = [];
    for (let i = 0; i < validTrips.length - 1; i++) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(extractWaypoint(validTrips[i]))}&destination=${encodeURIComponent(extractWaypoint(validTrips[i + 1]))}&travelmode=transit`;
      links.push({ label: `${validTrips[i].name} → ${validTrips[i + 1].name}`, url });
    }
    if (validTrips.length > 2) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(extractWaypoint(validTrips[0]))}&destination=${encodeURIComponent(extractWaypoint(validTrips[validTrips.length - 1]))}&travelmode=transit`;
      links.unshift({ label: '僅顯示第一站 → 最後一站', url, first: true });
    }
    const skippedNotice = skipped.length
      ? `<div style="font-size:11px;color:var(--amber);margin-bottom:8px">⚠️ 「${skipped.map(t => t.name).join('、')}」缺少連結，已略過</div>` : '';

    // 一次開啟全部按鈕（超過 1 段才顯示）
    const openAllBtn = links.length > 1
      ? `<button id="btn-transit-open-all" style="width:100%;background:var(--accent);color:#fff;border:none;border-radius:var(--r);padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px">${IC.mapIcon} 一次開啟全部路線（${links.length} 段）</button>`
      : '';

    $('transit-links').innerHTML = skippedNotice + openAllBtn + links.map(l =>
      `<a class="transit-seg" data-url="${esc(l.url)}">${l.first ? `${IC.link} ` : `${IC.pin} `}${esc(l.label)}</a>`
    ).join('');

    // 一次開啟全部
    const openAllEl = document.getElementById('btn-transit-open-all');
    if (openAllEl) {
      openAllEl.addEventListener('click', () => {
        links.forEach((l, i) => {
          setTimeout(() => chrome.tabs.create({ url: l.url }), i * 200);
        });
      });
    }

    $('transit-links').querySelectorAll('a').forEach(a => {
      a.addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: a.dataset.url }); });
    });
  } else {
    $('driving-checks').innerHTML = routeTrips.map((t, i) =>
      `<label class="day-check"><input type="checkbox" data-idx="${i}" checked><span>${i + 1}. ${esc(t.name)}${t.time ? ' (' + t.time + ')' : ''}${!t.mapUrl ? ' <span style="color:var(--amber);font-size:10px;font-weight:600;background:var(--amber-l);padding:1px 5px;border-radius:4px;margin-left:4px">⚠️ 無連結</span>' : ''}</span></label>`
    ).join('');
  }
}

function setRouteMode(mode) {
  routeMode = mode;
  document.querySelectorAll('.travel-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  renderRouteOpts();
}

function launchRoute() {
  const checked  = [...document.querySelectorAll('#driving-checks input:checked')];
  if (!checked.length) { showToast('請至少選擇一個地點'); return; }
  const selected = checked.map(cb => routeTrips[Number(cb.dataset.idx)]);
  const missing  = selected.filter(t => !t.mapUrl);
  if (missing.length) { showConflictTip('標示「⚠️ 無連結」的地點缺少 Google Maps 連結，可點擊地點卡片的編輯按鈕直接補上，或取消勾選後繼續。'); return; }
  chrome.tabs.create({ url: buildDrivingUrl(selected, routeMode) });
  cm('m-route');
}

function showConflictTip(msg) {
  let tip = $('route-conflict-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'route-conflict-tip';
    tip.style.cssText = 'margin-top:10px;background:var(--amber-l);border:1px solid var(--amber);border-radius:var(--r);padding:10px 28px 10px 12px;font-size:12px;color:var(--amber);line-height:1.6;position:relative;word-break:break-all';
    const close = document.createElement('button');
    close.innerHTML = IC.close;
    close.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;color:var(--amber);font-size:13px;line-height:1';
    close.addEventListener('click', () => tip.remove());
    tip.appendChild(close);
    $('driving-opts').insertAdjacentElement('afterend', tip);
  }
  let span = tip.querySelector('.tip-msg');
  if (!span) { span = document.createElement('span'); span.className = 'tip-msg'; tip.insertBefore(span, tip.firstChild); }
  span.textContent = msg;
  tip.style.display = 'block';
}

// =============================================================
//  Export
// =============================================================
function openExport() {
  const days = getTripDays();
  if (!days.length) { showToast('請先設定行程日期'); return; }
  $('export-days').innerHTML = days.map((d, i) => {
    const cnt = (db.trips[ap] || []).filter(t => t.date === d).length;
    return `<div class="export-day-check"><input type="checkbox" data-date="${d}" data-idx="${i}" checked><span>${fmtDayLabel(d, i, days.length)}${cnt ? ` (${cnt}個地點)` : ' (空)'}</span></div>`;
  }).join('');
  $('copy-result').classList.remove('show');
  $('copy-result').textContent = '';
  om('m-export');
}

function getCheckedDays() {
  return [...document.querySelectorAll('#export-days input:checked')].map(cb => ({ date: cb.dataset.date, idx: Number(cb.dataset.idx) }));
}

// ── 匯出共用：單日資料（ETA 鏈與 renderTimeline 同邏輯：出發時間 → 交通 → 指定時間覆寫）──
const EXP_MODE = { walk: '🚶步行', transit: '🚇大眾運輸', car: '🚗開車' };
function _expDurTxt(d) { return DUR[d] || (d ? `${d}分` : ''); }
function _expHrMin(total) {
  if (!total) return '0分';
  const h = Math.floor(total / 60), m = total % 60;
  return `${h > 0 ? h + '小時' : ''}${m > 0 ? m + '分' : ''}`;
}
function buildDayExport(date) {
  const p = db.projects.find(x => x.id === ap) || {};
  const dayTrips = sortedDayTrips(date);
  const ov = p.transit || {};
  const lodgeAM = morningLodging(date), lodgePM = eveningLodging(date);
  const amSeg = dayTrips.length ? lodgeTransit(lodgeAM, dayTrips[0]) : null;
  const pmSeg = dayTrips.length ? lodgeTransit(lodgePM, dayTrips[dayTrips.length - 1]) : null;
  const toMin = tm => { const [h, m] = String(tm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const toHM  = min => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  const startTime = (p.dayStartTimes || {})[date] || '09:00';
  const etas = [], gaps = [];   // gaps[i] = 前往第 i 站的交通（i ≥ 1）
  let cursor = toMin(startTime), transitTotal = 0, stayTotal = 0;
  dayTrips.forEach((t, i) => {
    if (i > 0) {
      const info = transitInfo(dayTrips[i - 1], t, ov);
      gaps[i] = info;
      if (info) { cursor += info.min; transitTotal += info.min; }
    } else if (amSeg) { cursor += amSeg.min; transitTotal += amSeg.min; }
    if (t.time) cursor = toMin(t.time);
    etas.push(toHM(cursor));
    cursor += Number(t.duration) || 0;
    stayTotal += Number(t.duration) || 0;
  });
  if (pmSeg) transitTotal += pmSeg.min;
  const backAt = pmSeg ? toHM(cursor + pmSeg.min) : '';
  const [y, m, d] = date.split('-').map(Number);
  return {
    dayTrips, etas, gaps, amSeg, pmSeg, lodgeAM, lodgePM, backAt,
    startTime, dayName: (p.dayNames || {})[date] || '',
    stayTotal, transitTotal,
    month: m, dayNum: d, weekday: '日一二三四五六'[new Date(y, m - 1, d).getDay()],
  };
}

function exportCSV() {
  const p = db.projects.find(x => x.id === ap) || {};
  const checked = getCheckedDays();
  if (!checked.length) { showToast('請選擇要匯出的天'); return; }

  const rows = [['日期','Day','星期','日名稱','順序','預計抵達','指定時間','地點名稱','類別','停留(分)','往下一站','交通(分)','備註','地址','Maps連結','當晚住宿']];
  checked.forEach(({ date, idx }) => {
    const D = buildDayExport(date);
    const base = [date, `Day ${idx + 1}`, `週${D.weekday}`, D.dayName];
    const lodge = D.lodgePM ? D.lodgePM.name : '';
    if (!D.dayTrips.length) {
      rows.push([...base, '', '', '', '（無行程）', '', '', '', '', '', '', '', lodge]);
    } else {
      D.dayTrips.forEach((t, i) => {
        const next = D.gaps[i + 1];   // 這一站 → 下一站
        const wItem = (db.wishlist[ap] || []).find(x => x.id === t.wishId);
        rows.push([...base, i + 1, D.etas[i], t.time || '', t.name, t.category || '',
          t.duration || '', next ? (EXP_MODE[next.mode] || next.mode) : '', next ? next.min : '',
          t.note || '', (wItem && wItem.address) || '', t.mapUrl || '', lodge]);
      });
    }
  });

  const bom = '\uFEFF';
  const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a   = document.createElement('a');
  a.href = url; a.download = `${p.name || '行程'}_匯出.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('✅ CSV 已下載，用 Excel 開啟即可');
}

function copyText() {
  const p = db.projects.find(x => x.id === ap) || {};
  const checked = getCheckedDays();
  if (!checked.length) { showToast('請選擇要複製的天'); return; }

  const fmtDate = d => d ? d.replace(/-/g, '/') : '';
  let text = `✈️ ${p.name || '旅遊行程'}`;
  if (p.destination) text += `｜${p.destination}`;
  if (p.startDate) text += `\n📅 ${fmtDate(p.startDate)} ～ ${fmtDate(p.endDate || p.startDate)}`;
  text += '\n';

  checked.forEach(({ date, idx }) => {
    const D = buildDayExport(date);
    text += `\n🗓 Day ${idx + 1}｜${D.month}月${D.dayNum}日（週${D.weekday}）${D.dayName ? `｜${D.dayName}` : ''}\n`;
    if (!D.dayTrips.length) {
      text += '（尚未安排行程）\n';
      return;
    }
    text += `🕘 ${D.startTime} ${D.lodgeAM ? `從「${D.lodgeAM.name}」` : ''}出發${D.amSeg ? `（${EXP_MODE[D.amSeg.mode]} ${D.amSeg.min}分）` : ''}\n`;
    D.dayTrips.forEach((t, i) => {
      const gap = D.gaps[i];
      if (gap) text += `　　↓ ${EXP_MODE[gap.mode] || ''} ${gap.min}分\n`;
      const eta = t.time ? `⏰${t.time}` : `約${D.etas[i]}`;
      text += `📍 ${eta} ${t.name}${t.duration ? `（停留${_expDurTxt(t.duration)}）` : ''}\n`;
      if (t.note) text += `　　└ ${t.note}\n`;
    });
    if (D.lodgePM) text += `🏨 返回「${D.lodgePM.name}」${D.pmSeg ? `（${EXP_MODE[D.pmSeg.mode]} ${D.pmSeg.min}分，約 ${D.backAt} 抵達）` : ''}\n`;
    text += `—— 共 ${D.dayTrips.length} 個地點｜停留 ${_expHrMin(D.stayTotal)}｜移動 ${_expHrMin(D.transitTotal)}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('✅ 已複製到剪貼簿');
  }).catch(() => {
    showToast('請手動複製下方文字');
  }).finally(() => {
    const el = $('copy-result');
    el.textContent = text;
    el.classList.add('show');
  });
}

function exportMarkdown() {
  const p = db.projects.find(x => x.id === ap) || {};
  const checked = getCheckedDays();
  if (!checked.length) { showToast('請選擇要匯出的天'); return; }

  const fmtDate = d => { const [y,m,dd] = d.split('-'); return `${y}/${m}/${dd}`; };
  const dateRange = p.startDate ? `${fmtDate(p.startDate)} ～ ${fmtDate(p.endDate || p.startDate)}` : '';

  let md = `# ✈️ ${p.name || '旅遊行程'}\n\n`;
  if (p.destination) md += `**目的地**：${p.destination}  \n`;
  if (dateRange)     md += `**日期**：${dateRange}  \n`;
  const lodgings = getLodgings();
  if (lodgings.length) {
    md += `**住宿**：\n`;
    lodgings.forEach(l => {
      const name = l.mapUrl ? `[${l.name}](${l.mapUrl})` : l.name;
      md += `- ${name}（${fmtDate(l.checkIn)} 入住 ～ ${fmtDate(l.checkOut)} 退房）\n`;
    });
  }
  md += '\n---\n';

  // 表格儲存格不能含 | 與換行
  const cell = s => String(s || '').replace(/\|/g, '｜').replace(/\r?\n/g, ' ');

  checked.forEach(({ date, idx }) => {
    const D = buildDayExport(date);
    md += `\n## Day ${idx + 1}｜${D.month}月${D.dayNum}日（週${D.weekday}）${D.dayName ? `｜${D.dayName}` : ''}\n\n`;

    if (!D.dayTrips.length) {
      md += '_尚未安排行程_\n';
      return;
    }
    md += `${D.startTime} 出發${D.lodgeAM ? `（${cell(D.lodgeAM.name)}${D.amSeg ? `，${EXP_MODE[D.amSeg.mode]} ${D.amSeg.min}分` : ''}）` : ''} · ${D.dayTrips.length} 個地點 · 停留 ${_expHrMin(D.stayTotal)} · 移動 ${_expHrMin(D.transitTotal)}\n\n`;
    md += `| 抵達 | 地點 | 類別 | 停留 | → 下一站 | 備註 |\n|---|---|---|---|---|---|\n`;
    D.dayTrips.forEach((t, i) => {
      const eta  = t.time ? `**${t.time}**` : `約${D.etas[i]}`;
      const name = t.mapUrl ? `[${cell(t.name)}](${t.mapUrl})` : cell(t.name);
      const next = D.gaps[i + 1];
      md += `| ${eta} | ${name} | ${t.category || ''} | ${_expDurTxt(t.duration)} | ${next ? `${EXP_MODE[next.mode] || ''} ${next.min}分` : ''} | ${cell(t.note)} |\n`;
    });
    if (D.lodgePM) md += `\n🏨 返回 ${cell(D.lodgePM.name)}${D.pmSeg ? `（${EXP_MODE[D.pmSeg.mode]} ${D.pmSeg.min}分，約 ${D.backAt} 抵達）` : ''}\n`;
  });

  // 下載為 .md 檔
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${p.name || '行程'}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ Markdown 已下載');
}

// =============================================================
//  Tab / Dropdown
// =============================================================
function showTab(t) {
  ['home', 'wish', 'timeline'].forEach(n => {
    $('pg-' + n).style.display = n === t ? 'block' : 'none';
    $('tb-' + n).classList.toggle('active', n === t);
  });
  at = t;
  // FAB 只在地點清單頁顯示
  const _fab = $('wish-fab');
  if (_fab) _fab.classList.toggle('show', t === 'wish');
  // 離開願望清單時隱藏多選工具列並清除勾選
  if (t !== 'wish') {
    const bar = $('wish-multi-bar');
    if (bar) bar.style.display = 'none';
    document.querySelectorAll('.wish-check:checked').forEach(cb => cb.checked = false);
  }
  // 離開「行程」頁時強制隱藏今日路線導航/匯出行程 bar，避免殘留疊在其他頁面上
  if (t !== 'timeline') {
    const tlBar = $('timeline-bar');
    if (tlBar) tlBar.classList.remove('show');
  }
  if (t === 'home')       renderHome();
  else if (t === 'wish')     renderWish();
  else if (t === 'timeline') renderTimeline();
  closeDD();
}

function toggleDD() {
  const d = $('dd'), b = $('proj-btn');
  const o = d.classList.toggle('open');
  b.classList.toggle('open', o);
  if (o && db.projects.length >= 1) {
    showHintOnce('invite', '#dd-share-proj', '可以邀請旅伴一起編輯這個專案——點「邀請夥伴」產生邀請碼');
  }
}
function closeDD()  { $('dd').classList.remove('open'); $('proj-btn').classList.remove('open'); }
function selProj(id) {
  ap = id; currentDayIdx = 0;
  clClearCache(id);
  wishFilter = { cat: 'all', sortField: 'rating', sortDir: 'desc', query: '' };
  closeDD(); renderAll(); showTab('home');
  chrome.storage.local.set({ activeProject: id });
  // Restart real-time sync for the newly selected project
  startWishlistSync(id);
  startTripsSync(id);
  startLodgingSync(id);
}

// =============================================================
//  Real-time Sync (Firebase SDK onValue listeners)
// =============================================================

let _wishlistUnsub = null;
let _wishlistSyncPid = null;
let _wishlistRenderTimer = null;

let _tripsUnsub = null;
let _tripsSyncPid = null;
let _tripsRenderTimer = null;
let _isDragging = false;

// Also normalizes legacy category value（2026-07 類別改名：餐廳 → 餐飲）
function _mapToArray(map) {
  if (!map) return [];
  const arr = Array.isArray(map)
    ? map
    : Object.values(map).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  arr.forEach(item => { if (item && item.category === '餐廳') item.category = '餐飲'; });
  return arr;
}

function startWishlistSync(pid) {
  stopWishlistSync();
  if (!pid || !window.fbListen) return;
  _wishlistSyncPid = pid;
  _wishlistUnsub = window.fbListen(`projects/${pid}/wishlist`, (data) => {
    if (_wishlistSyncPid !== pid) return;
    db.wishlist[pid] = _mapToArray(data);
    _scheduleWishlistRender();
  });
}

function stopWishlistSync() {
  if (_wishlistUnsub) { _wishlistUnsub(); _wishlistUnsub = null; }
  _wishlistSyncPid = null;
  if (_wishlistRenderTimer) { clearTimeout(_wishlistRenderTimer); _wishlistRenderTimer = null; }
}

function _scheduleWishlistRender() {
  if (_wishlistRenderTimer) return; // already scheduled
  _wishlistRenderTimer = setTimeout(() => {
    _wishlistRenderTimer = null;
    // Guards: skip if modal open, input focused, or wrong tab
    if (document.querySelector('.modal.open')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (at === 'wish') renderWish();
    else if (at === 'home') renderHome();
  }, 150);
}

function startTripsSync(pid) {
  stopTripsSync();
  if (!pid || !window.fbListen) return;
  _tripsSyncPid = pid;
  _tripsUnsub = window.fbListen(`projects/${pid}/trips`, (data) => {
    if (_tripsSyncPid !== pid) return;
    db.trips[pid] = _mapToArray(data);
    _scheduleTripsRender();
  });
}

function stopTripsSync() {
  if (_tripsUnsub) { _tripsUnsub(); _tripsUnsub = null; }
  _tripsSyncPid = null;
  if (_tripsRenderTimer) { clearTimeout(_tripsRenderTimer); _tripsRenderTimer = null; }
}

function _scheduleTripsRender() {
  if (_tripsRenderTimer) return;
  _tripsRenderTimer = setTimeout(() => {
    _tripsRenderTimer = null;
    if (document.querySelector('.modal.open')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (_isDragging) return;
    if (at === 'timeline') renderTimeline();
    else if (at === 'home') renderHome();
    else if (at === 'wish') renderWish(); // update scheduled badges
  }, 150);
}

let _lodgingUnsub = null;
let _lodgingSyncPid = null;
let _lodgingRenderTimer = null;

function startLodgingSync(pid) {
  stopLodgingSync();
  if (!pid || !window.fbListen) return;
  _lodgingSyncPid = pid;
  _lodgingUnsub = window.fbListen(`projects/${pid}/lodging`, (data) => {
    if (_lodgingSyncPid !== pid) return;
    const p = db.projects.find(x => x.id === pid);
    if (p) p.lodging = data || {};
    _scheduleLodgingRender();
  });
}

function stopLodgingSync() {
  if (_lodgingUnsub) { _lodgingUnsub(); _lodgingUnsub = null; }
  _lodgingSyncPid = null;
  if (_lodgingRenderTimer) { clearTimeout(_lodgingRenderTimer); _lodgingRenderTimer = null; }
}

function _scheduleLodgingRender() {
  if (_lodgingRenderTimer) return;
  _lodgingRenderTimer = setTimeout(() => {
    _lodgingRenderTimer = null;
    if (document.querySelector('.modal.open')) return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (at === 'timeline') renderTimeline();
  }, 150);
}

// =============================================================
//  Project CRUD
// =============================================================
function openNewProj() {
  if (db.projects.length >= 3) { showToast('已達專案上限（最多 3 個）'); return; }
  eid = null;
  $('mpt').textContent = '新增旅遊';
  ['pi-name','pi-dest','pi-s','pi-e'].forEach(i => $(i).value = '');
  sc = '#2d6a4f';
  document.querySelectorAll('.copt').forEach(o => o.classList.toggle('sel', o.dataset.c === sc));
  closeDD(); om('m-proj');
}

function editProj(id) {
  const p = db.projects.find(x => x.id === id); if (!p) return;
  eid = id;
  $('mpt').textContent = '編輯專案';
  $('pi-name').value = p.name || ''; $('pi-dest').value = p.destination || '';
  $('pi-s').value = p.startDate || ''; $('pi-e').value = p.endDate || '';
  sc = p.color || '#2d6a4f';
  document.querySelectorAll('.copt').forEach(o => o.classList.toggle('sel', o.dataset.c === sc));
  closeDD(); om('m-proj');
}

async function saveProj() {
  const n = $('pi-name').value.trim();
  if (!n) { alert('請輸入專案名稱'); return; }
  const s = $('pi-s').value, e = $('pi-e').value;

  function flashField(id) {
    const f = $(id);
    f.style.borderColor = 'var(--coral)'; f.style.background = 'var(--coral-l)';
    setTimeout(() => { f.style.borderColor = ''; f.style.background = ''; }, 2500);
  }
  if (!s || !e) {
    if (!s) flashField('pi-s');
    if (!e) flashField('pi-e');
    showToast('出發與結束日期都必須填寫'); return;
  }
  if (s > e) { flashField('pi-e'); showToast('結束日期不能早於出發日期'); return; }

  const obj = { id: eid || uid(), name: n, destination: $('pi-dest').value.trim(), startDate: s, endDate: e, color: sc, createdAt: Date.now() };

  if (eid && obj.startDate && obj.endDate) {
    const newDays   = buildDaySet(obj.startDate, obj.endDate);
    const conflicts = (db.trips[eid] || []).filter(t => t.date && !newDays.has(t.date));
    if (conflicts.length) { obj._conflictIds = conflicts.map(t => t.id); pendingProjObj = obj; openConflictModal(conflicts, newDays); return; }
  }
  await applyProjSave(obj);
}

async function applyProjSave(obj) {
  const isEdit = db.projects.some(x => x.id === obj.id);
  if (isEdit) { const i = db.projects.findIndex(x => x.id === obj.id); if (i >= 0) db.projects[i] = obj; }
  else {
    db.projects.push(obj); ap = obj.id; chrome.storage.local.set({ activeProject: obj.id });
    document.dispatchEvent(new CustomEvent('project-created'));   // first-run flow auto-advance
  }
  await saveDB(); renderAll(); showTab('home'); cm('m-proj');
  updateFirstRunTip();
}

// =============================================================
//  Member List & Ownership Transfer
// =============================================================

function _resolveMemberName(m, uid) {
  return m.nickname || m.displayName || uid.slice(0, 8);
}

function openMembersModal() {
  const p = db.projects.find(x => x.id === ap);
  if (!p || !p.members) return;
  const user = getCurrentUser();
  const myUid = user ? user.uid : '';
  const list = document.getElementById('members-list');
  if (!list) return;
  list.innerHTML = Object.entries(p.members).map(([uid, m]) => {
    const name = _resolveMemberName(m, uid);
    const isSelf = uid === myUid;
    const roleBadge = m.role === 'owner' ? '擁有者' : '成員';
    const roleClass = m.role === 'owner' ? 'mem-owner' : 'mem-member';
    const editBtn = isSelf ? `<button class="ib mem-edit-nick" data-uid="${uid}" title="修改暱稱"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : '';
    return `<div class="mem-row${isSelf ? ' mem-self' : ''}">
      <div class="mem-avatar">${name.charAt(0).toUpperCase()}</div>
      <div class="mem-info">
        <span class="mem-name" id="mem-name-${uid}">${esc(name)}${isSelf ? ' (你)' : ''}</span>
        <span class="mem-role ${roleClass}">${roleBadge}</span>
      </div>
      ${editBtn}
    </div>`;
  }).join('');

  // Bind nickname edit
  list.querySelectorAll('.mem-edit-nick').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const nameEl = document.getElementById('mem-name-' + uid);
      if (!nameEl) return;
      const current = (p.members[uid]?.nickname) || '';
      const input = document.createElement('input');
      input.type = 'text'; input.value = current; input.maxLength = 20;
      input.style.cssText = 'font-size:12px;padding:2px 6px;border:1px solid var(--accent);border-radius:4px;width:100px';
      nameEl.replaceWith(input);
      input.focus();
      const save = async () => {
        const newNick = input.value.trim();
        await window.projMerge(ap, `members/${uid}`, { nickname: newNick });
        if (p.members[uid]) p.members[uid].nickname = newNick;
        const span = document.createElement('span');
        span.className = 'mem-name'; span.id = 'mem-name-' + uid;
        span.textContent = (newNick || p.members[uid]?.displayName || uid.slice(0, 8)) + ' (你)';
        input.replaceWith(span);
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
  });

  om('m-members');
}

function delProj(id) {
  const p = db.projects.find(x => x.id === id);
  if (!p) return;
  delProjTarget = id;
  closeDD();

  const user = getCurrentUser();
  const isOwner = p.ownerId && user && p.ownerId === user.uid;
  const memberCount = p.members ? Object.keys(p.members).length : 1;
  const hasCollaborators = isOwner && memberCount > 1;

  const titleEl = $('del-proj-title');
  const descEl  = $('del-proj-desc');
  const confirmRow = $('del-proj-confirm-row');
  const transferRow = $('del-proj-transfer-row');
  const btn     = $('btn-del-proj-confirm');

  $('del-proj-name').textContent = p.name;

  if (hasCollaborators) {
    // Ownership transfer mode
    if (titleEl) titleEl.textContent = '轉移專案擁有權';
    if (descEl) descEl.textContent = '您是此專案的擁有者。退出前，請選擇一位成員接手管理，專案資料將完整保留。';
    if (confirmRow) confirmRow.style.display = 'none';
    if (transferRow) {
      transferRow.style.display = '';
      const radios = Object.entries(p.members)
        .filter(([uid]) => uid !== user.uid)
        .map(([uid, m]) => {
          const name = _resolveMemberName(m, uid);
          return `<label class="transfer-opt"><input type="radio" name="transfer-to" value="${uid}"><span>${esc(name)}</span><span class="mem-role mem-member">成員</span></label>`;
        }).join('');
      transferRow.innerHTML = radios;
      transferRow.querySelectorAll('input[name="transfer-to"]').forEach(r => {
        r.addEventListener('change', () => {
          btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
        });
      });
    }
    btn.textContent = '確認轉移並退出';
    btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
    btn.style.background = 'var(--accent)';
    btn.dataset.mode = 'transfer';
  } else if (isOwner) {
    if (titleEl)    titleEl.textContent = '刪除專案';
    if (descEl)     descEl.textContent  = '此操作無法復原。專案中所有地點、行程及資料將被永久刪除。';
    if (confirmRow) confirmRow.style.display = '';
    if (transferRow) transferRow.style.display = 'none';
    $('del-proj-confirm-input').value = '';
    btn.textContent = '確認刪除';
    btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
    btn.dataset.mode = 'delete';
  } else {
    if (titleEl)    titleEl.textContent = '退出專案';
    if (descEl)     descEl.textContent  = '退出後將無法存取此專案，但專案資料會保留給擁有者及其他成員。';
    if (confirmRow) confirmRow.style.display = 'none';
    if (transferRow) transferRow.style.display = 'none';
    btn.textContent = '確認退出';
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
    btn.style.background = 'var(--accent)';
    btn.dataset.mode = 'leave';
  }

  om('m-del-proj');
}

async function execDelProj() {
  if (!delProjTarget) return;
  const id = delProjTarget; delProjTarget = null;
  const p = db.projects.find(x => x.id === id);
  const user = getCurrentUser();
  const btn = $('btn-del-proj-confirm');
  const mode = btn?.dataset.mode || 'delete';

  if (mode === 'transfer') {
    // Ownership transfer: upgrade successor, update ownerId, remove self
    const selected = document.querySelector('input[name="transfer-to"]:checked');
    if (!selected) return;
    const successorUid = selected.value;
    try {
      await window.projMerge(id, `members/${successorUid}`, { role: 'owner' });
      await window.projMerge(id, 'info', { ownerId: successorUid });
      await window.projDelete(id, `members/${user.uid}`);
      await window.userProjectsRemove(id);
    } catch(e) { showToast('⚠️ 轉移失敗，請重試'); return; }
    db.projects = db.projects.filter(x => x.id !== id);
    delete db.wishlist[id]; delete db.trips[id];
    if (ap === id) ap = db.projects[0]?.id || null;
    cm('m-del-proj'); renderAll(); showTab('home');
    if (ap) { startWishlistSync(ap); startTripsSync(ap); startLodgingSync(ap); } else { stopWishlistSync(); stopTripsSync(); stopLodgingSync(); }
    showToast('👋 已轉移擁有權並退出專案');
  } else if (mode === 'delete') {
    // Solo owner: destructive delete
    db.projects = db.projects.filter(x => x.id !== id);
    delete db.wishlist[id]; delete db.trips[id];
    if (ap === id) ap = db.projects[0]?.id || null;
    await saveDB();
    cm('m-del-proj'); renderAll(); showTab('home');
    if (ap) { startWishlistSync(ap); startTripsSync(ap); startLodgingSync(ap); } else { stopWishlistSync(); stopTripsSync(); stopLodgingSync(); }
    showToast('🗑️ 專案已刪除');
  } else {
    // Guest leave
    await window.projDelete(id, 'members/' + user.uid);
    await window.userProjectsRemove(id);
    db.projects = db.projects.filter(x => x.id !== id);
    delete db.wishlist[id]; delete db.trips[id];
    if (ap === id) ap = db.projects[0]?.id || null;
    cm('m-del-proj'); renderAll(); showTab('home');
    if (ap) { startWishlistSync(ap); startTripsSync(ap); startLodgingSync(ap); } else { stopWishlistSync(); stopTripsSync(); stopLodgingSync(); }
    showToast('👋 已退出專案');
  }
}

// =============================================================
//  Conflict modal
// =============================================================
function openConflictModal(conflicts, newDays) {
  const newDaysArr    = [...newDays].sort();
  const newDayLabels  = newDaysArr.map((d, i) => {
    const [y, m, dd] = d.split('-').map(Number);
    return { date: d, label: `${m}月${dd}日（週${WKDAY[new Date(y, m - 1, dd).getDay()]}）Day ${i + 1}` };
  });
  $('conflict-list').innerHTML = conflicts.map(t => {
    const [y, m, dd]   = t.date.split('-').map(Number);
    const dateLabel    = `${m}月${dd}日（週${WKDAY[new Date(y, m - 1, dd).getDay()]}）`;
    const opts         = newDayLabels.map(d => `<option value="${d.date}">${d.label}</option>`).join('');
    return `<div class="conflict-item" data-trip-id="${t.id}">
      <div class="conflict-name">📍 ${esc(t.name)}</div>
      <div class="conflict-date">原本排在：${dateLabel}</div>
      <div class="conflict-actions">
        <select class="conflict-sel" data-mode="move"><option value="" disabled selected>搬移到…</option>${opts}</select>
        <button class="conflict-del-btn" data-mode="delete">刪除</button>
      </div>
    </div>`;
  }).join('');

  $('conflict-list').querySelectorAll('.conflict-item').forEach(item => {
    item.querySelector('.conflict-sel').addEventListener('change', () => item.dataset.action = 'move');
    item.querySelector('.conflict-del-btn').addEventListener('click', () => {
      item.dataset.action = 'delete';
      Object.assign(item.style, { transition: 'opacity .2s, max-height .25s', opacity: '0', maxHeight: '0', overflow: 'hidden', marginBottom: '0' });
      setTimeout(() => item.remove(), 260);
    });
  });
  om('m-conflict');
}

async function confirmConflict() {
  if (!pendingProjObj) return;
  const projId = pendingProjObj.id;
  const items  = [...$('conflict-list').querySelectorAll('.conflict-item')];
  for (const item of items) {
    const sel = item.querySelector('.conflict-sel');
    if (sel.value) {
      const t = (db.trips[projId] || []).find(x => x.id === item.dataset.tripId);
      if (t) t.date = sel.value;
    } else { showToast('請為剩餘每筆行程選擇搬移目標'); return; }
  }
  const remainingIds = new Set(items.map(i => i.dataset.tripId));
  if (pendingProjObj._conflictIds) {
    pendingProjObj._conflictIds.forEach(id => {
      if (!remainingIds.has(id)) db.trips[projId] = (db.trips[projId] || []).filter(t => t.id !== id);
    });
  }
  const objToSave = pendingProjObj; pendingProjObj = null;
  $('m-conflict').classList.remove('open');
  if (objToSave) await applyProjSave(objToSave);
}

// =============================================================
//  Wishlist CRUD
// =============================================================
function updateWiMapSearch() {
  const name = ($('wi-name').value || '').trim();
  const btn  = $('wi-map-search');
  if (!btn) return;
  if (name) {
    btn.href = `https://www.google.com/maps/search/${encodeURIComponent(name)}`;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  } else {
    btn.href = '#';
    btn.style.opacity = '0.35';
    btn.style.pointerEvents = 'none';
  }
}

function openWish(preset = {}) {
  if (!ap) { alert('請先選擇旅遊專案'); return; }
  eid = preset.id || null;
  $('mwt').textContent   = eid ? '編輯地點' : '新增地點';
  $('wi-name').value     = preset.name     || '';
  $('wi-cat').value      = preset.category || '景點';
  $('wi-dur').value      = preset.duration || 60;
  $('wi-note').value     = preset.note     || '';
  $('wi-map').value      = preset.mapUrl   || '';
  updateWiMapSearch();
  // 每次輸入名稱時同步更新搜尋連結
  $('wi-name').oninput = updateWiMapSearch;
  om('m-wish');
}

function editWish(id) { const w = (db.wishlist[ap] || []).find(x => x.id === id); if (w) openWish(w); }

async function saveWish() {
  const name = $('wi-name').value.trim();
  if (!name) { alert('請輸入地點名稱'); return; }
  // 新增時檢查同名地點，避免不同來源加入造成重複
  if (!eid && (db.wishlist[ap] || []).some(w => normName(w.name) === normName(name))) {
    if (!(await showConfirm('已在清單中，仍要加入？'))) return;
  }
  const existing = eid ? (db.wishlist[ap] || []).find(x => x.id === eid) : null;
  const item = {
    id: eid || uid(), name,
    category: $('wi-cat').value,
    rating:   existing ? existing.rating : 3,
    duration: Number($('wi-dur').value),
    note:     $('wi-note').value.trim(),
    mapUrl:   $('wi-map').value.trim(),
    createdAt: Date.now(),
  };
  if (!db.wishlist[ap]) db.wishlist[ap] = [];
  if (eid) { const i = db.wishlist[ap].findIndex(x => x.id === eid); if (i >= 0) db.wishlist[ap][i] = item; }
  else db.wishlist[ap].unshift(item);
  // 同步到已排入的行程
  if (eid && db.trips[ap]) {
    db.trips[ap].forEach(t => {
      if (t.wishId === eid) { t.category = item.category; t.note = item.note; t.mapUrl = item.mapUrl; }
    });
  }
  const newId = item.id;
  // Per-item write to Firebase (PUT full item)
  await window.projPatch(ap, `wishlist/${item.id}`, item);
  // Sync affected trip entries to Firebase (local mutation already done above)
  if (eid && db.trips[ap]) {
    const syncTrips = db.trips[ap].filter(t => t.wishId === eid);
    for (const t of syncTrips) {
      await window.projMerge(ap, `trips/${t.id}`, { category: item.category, note: item.note, mapUrl: item.mapUrl });
    }
  }
  renderWish(); cm('m-wish');
  if (at === 'timeline') renderTimeline();
  setTimeout(() => {
    const card = document.querySelector(`.wish-card[data-wish-id="${newId}"]`);
    if (card) { card.classList.add('highlight'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, 180);
}

async function delSelectedWishes() {
  const ids = [...document.querySelectorAll('#pg-wish .wish-check:checked')].map(cb => cb.dataset.wishId);
  if (!ids.length) { showToast('請先選擇要刪除的地點'); return; }
  const wishes = (db.wishlist[ap] || []).filter(w => ids.includes(w.id));
  if (!wishes.length) return;
  const label = wishes.length === 1 ? `「${wishes[0].name}」` : `已選的 ${wishes.length} 個地點`;
  if (!await showConfirm(`確定要刪除${label}？`)) return;

  const snapshots = wishes.map(w => JSON.parse(JSON.stringify(w)));
  const snapAp = ap;
  const idSet = new Set(ids);
  db.wishlist[ap] = (db.wishlist[ap] || []).filter(w => !idSet.has(w.id));
  await Promise.all(ids.map(id => window.projDelete(ap, `wishlist/${id}`)));
  renderWish();
  showUndoToast(`已刪除 ${wishes.length} 個地點`, async () => {
    if (!db.wishlist[snapAp]) db.wishlist[snapAp] = [];
    snapshots.reverse().forEach(s => db.wishlist[snapAp].unshift(s));
    await Promise.all(snapshots.map(s => window.projPatch(snapAp, `wishlist/${s.id}`, s)));
    if (at === 'wish') renderWish();
    if (at === 'home') renderHome();
  });
}

async function delWish(id) {
  const w = (db.wishlist[ap] || []).find(x => x.id === id);
  if (!w) return;
  const snapshot = JSON.parse(JSON.stringify(w));
  const snapAp   = ap;
  db.wishlist[ap] = (db.wishlist[ap] || []).filter(x => x.id !== id);
  await window.projDelete(ap, `wishlist/${id}`);
  renderWish();
  showUndoToast(`已刪除「${w.name}」`, async () => {
    if (!db.wishlist[snapAp]) db.wishlist[snapAp] = [];
    db.wishlist[snapAp].unshift(snapshot);
    await window.projPatch(snapAp, `wishlist/${snapshot.id}`, snapshot);
    if (at === 'wish') renderWish();
    if (at === 'home') renderHome();
  });
}

// =============================================================
//  Schedule
// =============================================================
function openSched(wishId) {
  if (!ap) { alert('請先選擇旅遊專案'); return; }
  const days = getTripDays();
  if (!days.length) { alert('請先在專案中設定出發與結束日期'); return; }
  schedWishId = wishId;
  const w = (db.wishlist[ap] || []).find(x => x.id === wishId) || {};
  $('sc-spot-name').textContent = w.name || '';
  const _schedDayNames = db.projects.find(x => x.id === ap)?.dayNames || {};
  $('sc-days').innerHTML = days.map((d, i) => {
    const [,dm,dd] = d.split('-').map(Number);
    const dn = _schedDayNames[d] ? ` · ${_schedDayNames[d]}` : '';
    const lbl = `Day ${i+1}  ${dm}/${dd}${dn}`;
    return `<div class="day-check" data-date="${d}" data-dur="${w.duration || 60}"><input type="checkbox" data-date="${d}" data-dur="${w.duration || 60}"><span class="day-chip-label">${esc(lbl)}</span></div>`;
  }).join('');
  $('sc-days').querySelectorAll('.day-check').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') { const cb = row.querySelector('input'); cb.checked = !cb.checked; }
      updateSlots();
    });
  });
  $('sc-slots').innerHTML = ''; om('m-sched');
}

function buildTimeOptions(selected = '') {
  let opts = '<option value="">未定</option>';
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      opts += `<option value="${val}"${selected === val ? ' selected' : ''}>${val}</option>`;
    }
  }
  return opts;
}

function slotEntryHTML(time = '', dur = 60, note = '') {
  const durOpts = Object.entries(DUR).map(([v, l]) => `<option value="${v}"${String(v) === String(dur) ? ' selected' : ''}>${l}</option>`).join('');
  const timeOpts = buildTimeOptions(time);
  return `<div class="slot-entry" style="margin-bottom:8px">
    <div class="frow" style="margin-bottom:4px">
      <div class="f" style="margin:0"><label>出發時間</label><select class="slot-time">${timeOpts}</select></div>
      <div class="f" style="margin:0"><label>停留</label><select class="slot-dur">${durOpts}</select></div>
    </div>
    <input class="slot-note" style="width:100%;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:7px 10px;font-size:12px;color:var(--text);font-family:inherit" placeholder="備註（選填）" value="${esc(note)}">
  </div>`;
}

function updateSlots() {
  const checked = [...document.querySelectorAll('#sc-days input:checked')];
  const el = $('sc-slots');
  if (!checked.length) { el.innerHTML = ''; return; }
  const existing = {};
  document.querySelectorAll('.day-slot').forEach(s => {
    const d = s.dataset.date; existing[d] = [];
    s.querySelectorAll('.slot-entry').forEach(e => {
      existing[d].push({ time: e.querySelector('.slot-time').value, dur: e.querySelector('.slot-dur').value, note: e.querySelector('.slot-note').value });
    });
  });
  el.innerHTML = checked.map(cb => {
    const date = cb.dataset.date, defDur = cb.dataset.dur;
    const slots = existing[date] || [{ time: '', dur: defDur, note: '' }];
    return `<div class="day-slot" data-date="${date}" data-defdur="${defDur}">
      <div class="day-slot-hd"><span>${date}</span><button class="add-slot-btn" data-slot-date="${date}">＋ 同日再加一個時段</button></div>
      ${slots.map(s => slotEntryHTML(s.time, s.dur, s.note)).join('')}
    </div>`;
  }).join('');
  el.querySelectorAll('.add-slot-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = el.querySelector(`.day-slot[data-date="${btn.dataset.slotDate}"]`);
      slot.insertAdjacentHTML('beforeend', slotEntryHTML('', slot.dataset.defdur || 60, ''));
    });
  });
}

async function saveSched() {
  const w = (db.wishlist[ap] || []).find(x => x.id === schedWishId) || {};
  const slots = [];
  document.querySelectorAll('.day-slot').forEach(s => {
    const date = s.dataset.date;
    s.querySelectorAll('.slot-entry').forEach(e => {
      slots.push({ date, time: e.querySelector('.slot-time').value, duration: Number(e.querySelector('.slot-dur').value), note: e.querySelector('.slot-note').value.trim() });
    });
  });
  if (!slots.length) { alert('請至少選擇一天'); return; }
  if (!db.trips[ap]) db.trips[ap] = [];
  const newIds = [];
  slots.forEach(s => {
    const existingMax = (db.trips[ap] || []).filter(t => t.date === s.date).reduce((m, t) => t.order != null ? Math.max(m, t.order) : m, -1);
    const newId = uid();
    newIds.push({ id: newId, date: s.date });
    db.trips[ap].push({ id: newId, wishId: w.id, name: w.name, category: w.category, mapUrl: w.mapUrl, date: s.date, time: s.time, duration: s.duration, note: w.note || '', order: existingMax + 1 });
  });
  await saveDB();
  renderWish();
  cm('m-sched');
  // 跳到行程 Tab 並 highlight 第一個排入的項目
  const firstNew = newIds[0];
  if (firstNew) {
    const days = getTripDays();
    const dayIdx = days.indexOf(firstNew.date);
    if (dayIdx >= 0) currentDayIdx = dayIdx;
    timelineView = 'day';
  }
  showTab('timeline');
  if (firstNew) {
    setTimeout(() => {
      const card = document.querySelector(`.trip-card[data-trip-id="${firstNew.id}"]`);
      if (card) { card.classList.add('highlight'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }, 180);
  }
  const dayLabels = [...new Set(newIds.map(n => n.date))].map(d => {
    const days = getTripDays(); const idx = days.indexOf(d);
    const [,m,dd] = d.split('-').map(Number);
    return idx >= 0 ? `Day ${idx+1}（${m}/${dd}）` : d;
  }).join('、');
  setTimeout(() => showToast(`✅ 已排入 ${dayLabels}`), 350);
}

// =============================================================
//  Trip edit / delete
// =============================================================
function editTrip(id) {
  const t = (db.trips[ap] || []).find(x => x.id === id); if (!t) return;
  const w = t.wishId ? (db.wishlist[ap] || []).find(x => x.id === t.wishId) : null;
  eid = id; $('mtt').textContent = '編輯：' + t.name;
  const days = getTripDays();
  $('ti-date').innerHTML = days.map((d, i) => {
    const [y2, m2, d2] = d.split('-').map(Number);
    return `<option value="${d}" ${d === t.date ? 'selected' : ''}>Day ${i + 1}  ${m2}/${d2}（週${WKDAY[new Date(y2, m2 - 1, d2).getDay()]}）</option>`;
  }).join('');
  $('ti-cat').value  = (w ? w.category : t.category) || '景點';
  $('ti-time').value = t.time || '';
  $('ti-dur').value  = t.duration || 60;
  $('ti-note').value = (w ? w.note : t.note) || '';
  $('ti-map').value  = (w ? w.mapUrl : t.mapUrl) || '';
  // 搜尋按鈕：根據地點名稱產生連結
  const updateTiSearch = () => {
    const name = t.name || '';
    const btn  = $('ti-map-search');
    if (!btn) return;
    btn.href = name ? `https://www.google.com/maps/search/${encodeURIComponent(name)}` : '#';
    btn.style.opacity = name ? '1' : '0.35';
    btn.style.pointerEvents = name ? 'auto' : 'none';
  };
  updateTiSearch();
  om('m-trip');
}

async function saveTrip() {
  if (!eid) return;
  const t = db.trips[ap].find(x => x.id === eid); if (!t) return;
  const newCat  = $('ti-cat').value;
  const newNote = $('ti-note').value.trim();
  const newDate = $('ti-date').value;
  const newMap  = $('ti-map').value.trim();
  t.date = newDate; t.time = $('ti-time').value; t.duration = Number($('ti-dur').value);
  t.category = newCat; t.note = newNote; t.mapUrl = newMap;
  if (t.wishId) {
    const w = (db.wishlist[ap] || []).find(x => x.id === t.wishId);
    if (w) { w.category = newCat; w.note = newNote; w.mapUrl = newMap; }
    (db.trips[ap] || []).forEach(tr => {
      if (tr.wishId === t.wishId && tr.id !== t.id) {
        tr.category = newCat; tr.note = newNote; tr.mapUrl = newMap;
      }
    });
  }
  const days   = getTripDays();
  const newIdx = days.indexOf(newDate);
  if (newIdx >= 0) currentDayIdx = newIdx;
  await saveDB(); cm('m-trip');
  setTimeout(() => { renderTimeline(); if (at === 'wish') renderWish(); }, 50);
}

async function delTrip(id) {
  const t = (db.trips[ap] || []).find(x => x.id === id);
  if (!t) return;
  const snapshot = JSON.parse(JSON.stringify(t));
  const snapAp   = ap;
  db.trips[ap] = (db.trips[ap] || []).filter(x => x.id !== id);
  // 清除與此行程相關的移動時間覆寫（自我清理，避免殘留孤兒 key）
  const _p = db.projects.find(x => x.id === snapAp);
  if (_p?.transit) {
    Object.keys(_p.transit).filter(k => k.startsWith(id + '_') || k.endsWith('_' + id)).forEach(k => {
      delete _p.transit[k];
      window.projDelete(snapAp, `transit/${k}`).catch(() => {});
    });
  }
  await saveDB(); renderTimeline();
  showUndoToast(`已移除「${t.name}」`, async () => {
    if (!db.trips[snapAp]) db.trips[snapAp] = [];
    db.trips[snapAp].push(snapshot);
    await saveDB();
    if (at === 'timeline') renderTimeline();
  });
}

// =============================================================
//  Quick add from Maps banner
// =============================================================
function quickAddWish() {
  if (!ap) { alert('請先選擇旅遊專案'); return; }
  hideBanner(); showTab('wish');
  openWish({ name: pending?.name || '', mapUrl: pending?.mapUrl || '', category: '景點' });
}

// =============================================================
//  Batch import
// =============================================================
function makeBatchRow(name = '', mapUrl = '') {
  const row = document.createElement('div');
  row.className = 'batch-row';
  row.innerHTML = `
    <input class="batch-name" placeholder="地點名稱" value="${esc(name)}">
    <input class="batch-url" placeholder="請貼上 Google Maps 連結" value="${esc(mapUrl)}">
    <a class="batch-map-btn" target="_blank" title="在 Google Maps 搜尋">🔍</a>
    <button class="batch-row-del" title="刪除">✕</button>`;
  const nameInput  = row.querySelector('.batch-name');
  const searchBtn  = row.querySelector('.batch-map-btn');
  nameInput.addEventListener('input', () => {
    const q = nameInput.value.trim();
    searchBtn.href = q ? `https://www.google.com/maps/search/${encodeURIComponent(q)}` : '#';
  });
  if (name) searchBtn.href = `https://www.google.com/maps/search/${encodeURIComponent(name)}`;
  row.querySelector('.batch-row-del').addEventListener('click', () => row.remove());
  return row;
}

function openBatchImport() {
  if (!ap) { alert('請先選擇旅遊專案'); return; }
  const container = $('batch-rows');
  container.innerHTML = '';
  const hdr = document.createElement('div');
  hdr.className = 'batch-header';
  hdr.innerHTML = '<span style="padding-left:2px">地點名稱</span><span>Maps 連結（選填）</span><span></span><span></span>';
  container.appendChild(hdr);
  for (let i = 0; i < 3; i++) container.appendChild(makeBatchRow());
  // 清空貼上區
  const pa = $('batch-paste-area');
  if (pa) pa.value = '';
  om('m-batch');
}

function pasteImport() {
  const area = $('batch-paste-area');
  if (!area) return;
  const lines = area.value.split('\n').map(l => l.trim()).filter(l => l);
  if (!lines.length) { showToast('請先輸入地點名稱'); return; }
  const container = $('batch-rows');
  // 清空已有列（保留 header）
  const hdr = container.querySelector('.batch-header');
  container.innerHTML = '';
  if (hdr) container.appendChild(hdr);
  else {
    const h = document.createElement('div');
    h.className = 'batch-header';
    h.innerHTML = '<span style="padding-left:2px">地點名稱</span><span>Maps 連結（選填）</span><span></span><span></span>';
    container.appendChild(h);
  }
  lines.forEach(name => container.appendChild(makeBatchRow(name, '')));
  area.value = '';
  showToast(`✅ 已建立 ${lines.length} 筆，可補充 Maps 連結後匯入`);
}

function addBatchRow() {
  const container = $('batch-rows');
  container.appendChild(makeBatchRow());
  container.lastElementChild.querySelector('.batch-name').focus();
}

async function runBatchImport() {
  const rows  = [...$('batch-rows').querySelectorAll('.batch-row')];
  const items = rows.map(r => ({
    id: uid(),
    name:   r.querySelector('.batch-name').value.trim(),
    mapUrl: r.querySelector('.batch-url').value.trim(),
  })).filter(x => x.name);
  if (!items.length) { showToast('請輸入至少一個地點名稱'); return; }
  // 重複偵測（batch 沒座標,isSamePlace 退回名稱一致即算重複）
  const _existingWishes = db.wishlist[ap] || [];
  const _seenInBatch = [];
  let _skipped = 0;
  const uniqueItems = items.filter(it => {
    if (_existingWishes.some(w => isSamePlace(w, it)) || _seenInBatch.some(w => isSamePlace(w, it))) {
      _skipped++;
      return false;
    }
    _seenInBatch.push(it);
    return true;
  });
  if (!uniqueItems.length) { showToast('這些地點都已在清單中，未重複匯入'); return; }
  if (!db.wishlist[ap]) db.wishlist[ap] = [];
  const newWishItems = [];
  [...uniqueItems].reverse().forEach(item => {
    const wishItem = { id: item.id, name: item.name, mapUrl: item.mapUrl, category: '景點', rating: 3, duration: 60, note: '', createdAt: Date.now() };
    db.wishlist[ap].unshift(wishItem);
    newWishItems.push(wishItem);
  });
  await Promise.all(newWishItems.map(w => window.projPatch(ap, `wishlist/${w.id}`, w)));
  showToast(`✅ 已匯入 ${uniqueItems.length} 個地點${_skipped ? `（略過 ${_skipped} 個重複）` : ''}`);
  cm('m-batch');
  showTab('wish');
  // renderWish 是同步的，等下一個 frame 再找 card
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      uniqueItems.forEach(item => {
        const card = document.querySelector(`.wish-card[data-wish-id="${item.id}"]`);
        if (card) card.classList.add('highlight');
      });
      const first = document.querySelector('.wish-card.highlight');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// =============================================================
//  Multi-select schedule
// =============================================================
function openMultiSched(ids) {
  if (!ids.length) { showToast('請選擇地點'); return; }
  const days = getTripDays();
  if (!days.length) { alert('請先在專案中設定出發與結束日期'); return; }
  multiSchedIds = ids;
  $('multi-sel-count').textContent = ids.length;
  const _multiDayNames = db.projects.find(x => x.id === ap)?.dayNames || {};
  $('multi-sched-days').innerHTML = days.map((d, i) => {
    const [,dm,dd] = d.split('-').map(Number);
    const dn = _multiDayNames[d] ? ` · ${_multiDayNames[d]}` : '';
    return `<div class="day-check" data-date="${d}"><input type="checkbox" data-date="${d}"><span class="day-chip-label">${esc(`Day ${i+1}  ${dm}/${dd}${dn}`)}</span></div>`;
  }).join('');
  $('multi-sched-days').querySelectorAll('.day-check').forEach(row => {
    row.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') { const cb = row.querySelector('input'); cb.checked = !cb.checked; } });
  });
  om('m-multi-sched');
}

async function saveMultiSched() {
  const dates = [...document.querySelectorAll('#multi-sched-days input:checked')].map(cb => cb.dataset.date);
  if (!dates.length) { showToast('請選擇至少一天'); return; }
  if (!db.trips[ap]) db.trips[ap] = [];
  multiSchedIds.forEach(wid => {
    const w = (db.wishlist[ap] || []).find(x => x.id === wid); if (!w) return;
    dates.forEach(date => {
      db.trips[ap].push({ id: uid(), wishId: w.id, name: w.name, category: w.category || '景點', mapUrl: w.mapUrl, date, time: '', duration: w.duration || 60, note: w.note || '' });
    });
  });
  await saveDB();
  cm('m-multi-sched');

  // 清除 checkbox 勾選狀態 & 隱藏工具列
  window._checkedWishIds = null;
  document.querySelectorAll('.wish-check:checked').forEach(cb => cb.checked = false);
  const bar = $('wish-multi-bar');
  if (bar) bar.style.display = 'none';

  // 組日期標籤
  const allDays = getTripDays();
  const dayLabels = [...new Set(dates)].map(d => {
    const idx = allDays.indexOf(d);
    const [,m,dd] = d.split('-').map(Number);
    return idx >= 0 ? `Day ${idx+1}（${m}/${dd}）` : d;
  }).join('、');
  showToast(`✅ ${multiSchedIds.length} 個地點已排入 ${dayLabels}`);

  renderWish();
}

// =============================================================
//  Modal helpers
// =============================================================
function om(id) { $(id).classList.add('open'); }
function cm(id) { $(id).classList.remove('open'); eid = null; }

// =============================================================
//  整天移至其他日期
// =============================================================
function openMoveDay() {
  const days = getTripDays();
  const from = days[currentDayIdx];
  const cnt = sortedDayTrips(from).length;
  if (!cnt) return;
  const dayNames = db.projects.find(x => x.id === ap)?.dayNames || {};
  $('md-hint').textContent = `將 Day ${currentDayIdx + 1} 的 ${cnt} 個地點全部移至：`;
  $('md-days').innerHTML = days.map((d, i) => {
    if (i === currentDayIdx) return '';
    const [, dm, dd] = d.split('-').map(Number);
    const dn = dayNames[d] ? `（${dayNames[d]}）` : '';
    const tc = sortedDayTrips(d).length;
    return `<div class="day-check md-day" data-date="${d}" data-idx="${i}" style="cursor:pointer"><span class="day-chip-label">Day ${i + 1}  ${dm}/${dd}${esc(dn)}${tc ? ` · 已有 ${tc} 個地點` : ''}</span></div>`;
  }).join('');
  $('md-days').querySelectorAll('.md-day').forEach(row =>
    row.addEventListener('click', () => moveWholeDay(row.dataset.date, Number(row.dataset.idx))));
  $('mc-moveday').onclick = () => cm('m-moveday');
  om('m-moveday');
}

async function moveWholeDay(toDate, toIdx) {
  const days = getTripDays();
  const from = days[currentDayIdx];
  const moving = sortedDayTrips(from);
  cm('m-moveday');
  if (!moving.length) return;
  const ok = await showConfirm(`確定將 ${moving.length} 個地點從 Day ${currentDayIdx + 1} 全部移至 Day ${toIdx + 1}？`);
  if (!ok) return;
  const baseOrder = sortedDayTrips(toDate).length;
  moving.forEach((t, i) => { t.date = toDate; t.order = baseOrder + i; });
  await Promise.all(moving.map(t => window.projMerge(ap, `trips/${t.id}`, { date: toDate, order: t.order })));
  currentDayIdx = toIdx;
  renderTimeline();
  showToast(`✅ 已全部移至 Day ${toIdx + 1}`);
}

// 一鍵順路排序：固定第一站，貪婪最近鄰重排（以 transitInfo 估算分鐘為距離）
async function optimizeDayOrder(dateStr) {
  const trips = sortedDayTrips(dateStr);
  if (trips.length < 3 || !trips.every(t => tripCoords(t))) return;
  const overrides = db.projects.find(x => x.id === ap)?.transit || {};
  const cost = (a, b) => { const info = transitInfo(a, b, overrides); return info ? info.min : 9999; };
  const sumCost = list => list.reduce((s, t, i) => i ? s + cost(list[i - 1], t) : 0, 0);
  const before = sumCost(trips);
  const remaining = trips.slice(1);
  const ordered = [trips[0]];
  while (remaining.length) {
    const last = ordered[ordered.length - 1];
    let bi = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (cost(last, remaining[i]) < cost(last, remaining[bi])) bi = i;
    }
    ordered.push(remaining.splice(bi, 1)[0]);
  }
  const after = sumCost(ordered);
  if (after >= before) { showToast('目前順序已接近最短路線'); return; }
  const ok = await showConfirm(`順路排序可將移動時間由 ≈${before} 分縮短為 ≈${after} 分，套用新順序？（仍可拖曳微調）`);
  if (!ok) return;
  ordered.forEach((t, i) => { t.order = i; });
  await Promise.all(ordered.map(t => window.projMerge(ap, `trips/${t.id}`, { order: t.order })));
  renderTimeline();
  showToast(`✅ 已重新排序，移動 ≈${after} 分`);
}

// =============================================================
//  站點間移動時間（自動估算 + 手動覆寫）
// =============================================================
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 相同地點判定:名稱一致（normName） + 座標距離 <100m。任一方無座標則名稱一致即算重複。
function isSamePlace(a, b) {
  if (!a || !b || !a.name || !b.name) return false;
  if (normName(a.name) !== normName(b.name)) return false;
  const la = a.lat, lna = a.lng, lb = b.lat, lnb = b.lng;
  if (la == null || lna == null || lb == null || lnb == null) return true;
  return haversineKm(Number(la), Number(lna), Number(lb), Number(lnb)) < 0.1;
}

// nearest-neighbor 試算:第一站固定,後續每次選最近的下一站,回傳總移動分鐘
function computeOptimizedTransitTotal(dayTrips, transit) {
  if (dayTrips.length < 2) return 0;
  const remaining = dayTrips.slice(1);
  const order = [dayTrips[0]];
  while (remaining.length) {
    const last = order[order.length - 1];
    let bestIdx = 0, bestMin = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const info = transitInfo(last, remaining[i], transit);
      const min = info ? info.min : 0;
      if (min < bestMin) { bestMin = min; bestIdx = i; }
    }
    order.push(remaining.splice(bestIdx, 1)[0]);
  }
  let total = 0;
  for (let i = 1; i < order.length; i++) {
    const info = transitInfo(order[i-1], order[i], transit);
    if (info) total += info.min;
  }
  return total;
}

function tripCoords(t) {
  const w = t.wishId ? (db.wishlist[ap] || []).find(x => x.id === t.wishId) : null;
  const lat = t.lat ?? (w ? w.lat : null), lng = t.lng ?? (w ? w.lng : null);
  if (lat != null && lng != null) return { lat: Number(lat), lng: Number(lng) };
  const m = (t.mapUrl || (w && w.mapUrl) || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

// =============================================================
//  住宿（lodging）：日期區間制，每天從住宿出發、回到住宿
// =============================================================
function getLodgings() {
  const p = db.projects.find(x => x.id === ap);
  return Object.values(p?.lodging || {}).filter(l => l && l.checkIn).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
function morningLodging(d) { return getLodgings().find(l => l.checkIn < d && d <= l.checkOut) || null; }
function eveningLodging(d) { return getLodgings().find(l => l.checkIn <= d && d < l.checkOut) || null; }

function lodgeCoords(l) {
  if (!l) return null;
  if (l.lat != null && l.lng != null) return { lat: Number(l.lat), lng: Number(l.lng) };
  const m = (l.mapUrl || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
function lodgeTransit(lodge, trip) {
  const ca = lodgeCoords(lodge), cb = trip ? tripCoords(trip) : null;
  if (!ca || !cb) return null;
  const km = haversineKm(ca.lat, ca.lng, cb.lat, cb.lng);
  if (km < 1.5) return { min: Math.max(1, Math.round(km / 4.5 * 60)), mode: 'walk' };
  return { min: Math.round(km / 20 * 60 + 10), mode: 'transit' };
}

let _lgEditId = null;
function openLodging(dateStr) {
  const cur = eveningLodging(dateStr) || morningLodging(dateStr);
  _lgFill(cur, dateStr);
  om('m-lodging');
}
function _lgFill(cur, dateStr) {
  const lodgings = getLodgings();
  _lgEditId = cur ? cur.id : null;
  const p = db.projects.find(x => x.id === ap);
  $('lg-name').value = cur?.name || '';
  $('lg-map').value  = cur?.mapUrl || '';
  $('lg-in').value   = cur?.checkIn  || (lodgings.length ? lodgings[lodgings.length - 1].checkOut : p?.startDate) || dateStr;
  $('lg-out').value  = cur?.checkOut || p?.endDate || dateStr;
  $('lg-note').value = cur?.note || '';
  $('lg-del').style.display = cur ? '' : 'none';
  $('lg-list').innerHTML = lodgings.map(l =>
    `<div class="lg-item${cur && l.id === cur.id ? ' on' : ''}" data-lg="${l.id}">${esc(l.name)}｜${l.checkIn.slice(5).replace('-', '/')}～${l.checkOut.slice(5).replace('-', '/')}</div>`
  ).join('') + (lodgings.length ? `<div class="lg-item add" data-lg="_new">＋ 新增另一段住宿</div>` : '');
  $('lg-list').querySelectorAll('.lg-item').forEach(it => it.onclick = () => {
    _lgFill(it.dataset.lg === '_new' ? null : lodgings.find(x => x.id === it.dataset.lg), dateStr);
  });
  $('mc-lodging').onclick = () => cm('m-lodging');
  $('lg-save').onclick = saveLodging;
  $('lg-del').onclick  = delLodging;
}
async function saveLodging() {
  const name = $('lg-name').value.trim();
  const ci = $('lg-in').value, co = $('lg-out').value;
  if (!name) { showToast('請輸入住宿名稱'); return; }
  if (!ci || !co || co <= ci) { showToast('退房日需晚於入住日'); return; }
  const mapUrl = $('lg-map').value.trim() || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  const m = mapUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const item = {
    id: _lgEditId || uid(), name, mapUrl,
    checkIn: ci, checkOut: co,
    note: $('lg-note').value.trim(),
    lat: m ? Number(m[1]) : null, lng: m ? Number(m[2]) : null,
    createdAt: Date.now(),
  };
  const p = db.projects.find(x => x.id === ap);
  const overlap = Object.values(p?.lodging || {}).some(l => l && l.id !== item.id && l.checkIn < co && ci < l.checkOut);
  if (!p.lodging) p.lodging = {};
  p.lodging[item.id] = item;
  await window.projPatch(ap, `lodging/${item.id}`, item);
  cm('m-lodging');
  if (overlap) showToast('⚠️ 與另一段住宿日期重疊，請確認');
  renderTimeline();
}
async function delLodging() {
  if (!_lgEditId) return;
  if (!(await showConfirm('刪除這段住宿？'))) return;
  const p = db.projects.find(x => x.id === ap);
  if (p?.lodging) delete p.lodging[_lgEditId];
  await window.projDelete(ap, `lodging/${_lgEditId}`);
  cm('m-lodging');
  renderTimeline();
}

// 回傳 { min, mode, manual } 或 null（雙方都無座標且無手動覆寫時）
function transitInfo(a, b, overrides) {
  const ov = overrides ? overrides[`${a.id}_${b.id}`] : null;
  if (ov && ov.min > 0) return { min: ov.min, mode: ov.mode || 'transit', manual: true };
  const ca = tripCoords(a), cb = tripCoords(b);
  if (!ca || !cb) return null;
  const km = haversineKm(ca.lat, ca.lng, cb.lat, cb.lng);
  // 使用者可覆寫 mode（walk / transit / car），未覆寫就依距離自動選 walk 或 transit
  const autoMode = km < 1.5 ? 'walk' : 'transit';
  const mode = (ov && ov.mode) ? ov.mode : autoMode;
  const min = mode === 'walk' ? Math.max(1, Math.round(km / 4.5 * 60))
            : mode === 'car'  ? Math.max(1, Math.round(km / 30 * 60) + 3)
            :                   Math.round(km / 20 * 60 + 10);
  return { min, mode, manual: false };
}

function transitRowHtml(a, b, overrides) {
  const info = transitInfo(a, b, overrides);
  if (!info) return '';
  const icon = info.mode === 'walk' ? IC.walk : info.mode === 'car' ? IC.car : IC.train;
  const chev = '<svg class="tr-chev" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const key = `${a.id}_${b.id}`;
  return `<div class="transit-row ${info.manual ? 'manual' : ''}" data-from="${a.id}" data-to="${b.id}" data-min="${info.min}" data-mode="${info.mode}"><button class="tr-nav" data-tr-nav="${key}" title="開啟 Google Maps 路線"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></button><span class="tr-mode" data-tr-mode="${key}" title="選擇交通方式">${icon}${chev}</span><span class="tr-label" data-tr-key="${key}" title="點擊編輯移動時間">${info.min}分</span></div>`;
}

function openTransitDir(fromId, toId, mode) {
  const a = (db.trips[ap] || []).find(x => x.id === fromId);
  const b = (db.trips[ap] || []).find(x => x.id === toId);
  if (!a || !b) return;
  const travel = mode === 'walk' ? 'walking' : mode === 'car' ? 'driving' : 'transit';
  const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(extractWaypoint(a))}&destination=${encodeURIComponent(extractWaypoint(b))}&travelmode=${travel}`;
  window.open(url, '_blank');
}

// 交通方式下拉:點左側 icon 打開;選擇後存到 transit/{key}.mode,重繪時間軸
function openTransitModeMenu(key, anchor) {
  closeTransitModeMenu();
  const opts = [
    { mode: 'walk',    label: '步行',     icon: IC.walk },
    { mode: 'transit', label: '大眾運輸', icon: IC.train },
    { mode: 'car',     label: '開車',     icon: IC.car  },
  ];
  const menu = document.createElement('div');
  menu.id = 'transit-mode-menu';
  menu.innerHTML = opts.map(o =>
    `<div class="tmm-item" data-mode="${o.mode}">${o.icon}<span>${o.label}</span></div>`
  ).join('');
  const rect = anchor.getBoundingClientRect();
  Object.assign(menu.style, {
    position: 'fixed',
    top: `${rect.bottom + 2}px`,
    left: `${rect.left}px`,
    zIndex: '1000',
  });
  document.body.appendChild(menu);
  menu.querySelectorAll('.tmm-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      await setTransitMode(key, item.dataset.mode);
      closeTransitModeMenu();
    });
  });
  setTimeout(() => document.addEventListener('click', closeTransitModeMenu, { once: true }), 0);
  window._transitModeMenu = menu;
}
function closeTransitModeMenu() {
  if (window._transitModeMenu) {
    window._transitModeMenu.remove();
    window._transitModeMenu = null;
  }
}
async function setTransitMode(key, mode) {
  const p = db.projects.find(x => x.id === ap);
  if (!p) return;
  if (!p.transit) p.transit = {};
  if (!p.transit[key]) p.transit[key] = {};
  p.transit[key].mode = mode;
  await window.projMerge(ap, `transit/${key}`, { mode });
  renderTimeline();
}

function editTransit(key, btn) {
  const row = btn.closest('.transit-row');
  if (!row) return;
  const p = db.projects.find(x => x.id === ap);
  const cur = (p?.transit || {})[key];
  const mode = cur ? (cur.mode || 'transit') : row.dataset.mode;
  row.innerHTML = `<input type="number" class="tr-input" min="0" max="600" value="${cur ? cur.min : row.dataset.min}"> 分（清空可還原自動估算）`;
  const inp = row.querySelector('input');
  inp.focus(); inp.select();
  const save = async () => {
    const v = inp.value.trim();
    if (v === '' || Number(v) <= 0) {
      if (cur) { await window.projDelete(ap, `transit/${key}`); if (p?.transit) delete p.transit[key]; }
    } else {
      const rec = { min: Math.round(Number(v)), mode };
      await window.projPatch(ap, `transit/${key}`, rec);
      if (!p.transit) p.transit = {};
      p.transit[key] = rec;
    }
    renderTimeline();
  };
  inp.addEventListener('blur', save, { once: true });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.removeEventListener('blur', save); renderTimeline(); }
  });
}

// =============================================================
//  打卡（已走訪）
// =============================================================
async function toggleVisited(id, btn) {
  const t = (db.trips[ap] || []).find(x => x.id === id);
  if (!t) return;
  t.visited = !t.visited;
  const card = btn.closest('.trip-card');
  if (card) card.classList.toggle('visited', t.visited);
  btn.classList.toggle('checked', t.visited);
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  const dayTrips = sortedDayTrips(t.date);
  const vp = $('visit-progress');
  if (vp) vp.textContent = `${dayTrips.filter(x => x.visited).length}/${dayTrips.length}`;
  await window.projMerge(ap, `trips/${t.id}`, { visited: !!t.visited });
}

// =============================================================
//  每日天氣（Open-Meteo，免金鑰、僅未來 16 天）
// =============================================================
function wxEmoji(code) {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
  if (code <= 77 || (code >= 85 && code <= 86)) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌦️';
}

async function fetchWeather() {
  const days = getTripDays();
  if (!days.length) return;
  // 取第一個有座標的地點（城市級即可，整趟旅程共用一組座標）
  let c = null;
  for (const t of (db.trips[ap] || [])) { c = tripCoords(t); if (c) break; }
  if (!c) {
    for (const w of (db.wishlist[ap] || [])) {
      if (w.lat != null && w.lng != null) { c = { lat: Number(w.lat), lng: Number(w.lng) }; break; }
      const m = (w.mapUrl || '').match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) { c = { lat: Number(m[1]), lng: Number(m[2]) }; break; }
    }
  }
  if (!c) return;
  const pad = n => String(n).padStart(2, '0');
  const dstr = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const sd = days[0] > dstr(new Date()) ? days[0] : dstr(new Date());
  const maxD = dstr(new Date(Date.now() + 15 * 86400000));
  const ed = days[days.length - 1] < maxD ? days[days.length - 1] : maxD;
  if (sd > ed) return;
  const key = `${ap}|${sd}|${ed}`;
  if (weatherFetchKey === key) return;
  weatherFetchKey = key;
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}&daily=weather_code,temperature_2m_max&timezone=auto&start_date=${sd}&end_date=${ed}`);
    const j = await r.json();
    const out = {};
    (j.daily?.time || []).forEach((d, i) => { out[d] = { code: j.daily.weather_code[i], t: Math.round(j.daily.temperature_2m_max[i]) }; });
    weatherByDate = out;
    const pg = $('pg-timeline');
    if (pg && pg.style.display !== 'none') renderTimeline();
  } catch (e) { /* 天氣為輔助資訊，取得失敗時靜默略過 */ }
}

// =============================================================
//  分享今日行程（Web Share API，不支援時複製到剪貼簿）
// =============================================================
async function shareDay() {
  const days = getTripDays();
  const d = days[currentDayIdx];
  const trips = sortedDayTrips(d);
  if (!trips.length) return;
  const dayNames = db.projects.find(x => x.id === ap)?.dayNames || {};
  const title = `${fmtDayLabel(d, currentDayIdx, days.length)}${dayNames[d] ? '｜' + dayNames[d] : ''}`;
  const lines = trips.map((t, i) => {
    const w = t.wishId ? (db.wishlist[ap] || []).find(x => x.id === t.wishId) : null;
    const u = itemMapUrl(t.mapUrl || (w && w.mapUrl), t.name);
    return `${i + 1}. ${t.time ? t.time + ' ' : ''}${t.name}${u ? '\n' + u : ''}`;
  });
  const text = `${title}\n${lines.join('\n')}`;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch (e) { /* 使用者取消分享 */ }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    showToast('✅ 已複製今日行程文字');
  }
}

function showConfirm(msg) {
  return new Promise(resolve => {
    $('confirm-msg').textContent = msg;
    om('m-confirm');
    const ok     = $('confirm-ok');
    const cancel = $('confirm-cancel');
    const close  = $('mc-confirm');
    const finish = val => { cm('m-confirm'); ok.replaceWith(ok.cloneNode(true)); cancel.replaceWith(cancel.cloneNode(true)); close.replaceWith(close.cloneNode(true)); resolve(val); };
    $('confirm-ok').addEventListener('click',     () => finish(true),  { once: true });
    $('confirm-cancel').addEventListener('click', () => finish(false), { once: true });
    $('mc-confirm').addEventListener('click',     () => finish(false), { once: true });
  });
}

// =============================================================
//  觸控手勢（手機邏輯）：時間軸左右滑切換天數、地點卡左滑刪除
// =============================================================
function initGestures() {
  // ── 時間軸：水平滑動切換前/後一天（僅單日檢視；排除水平捲動區與互動元件）──
  const tl = $('pg-timeline');
  let tX = 0, tY = 0, tT = 0, tOk = false;
  tl.addEventListener('touchstart', e => {
    tOk = !e.target.closest('#mini-date-bar, input, textarea, select, button, a, .transit-row');
    if (!tOk) return;
    const t = e.touches[0];
    tX = t.clientX; tY = t.clientY; tT = Date.now();
  }, { passive: true });
  tl.addEventListener('touchend', e => {
    if (!tOk || timelineView !== 'day' || document.querySelector('.mwrap.open')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tX, dy = t.clientY - tY;
    // 60px 門檻＋水平位移需明顯大於垂直（避免誤觸捲動）＋600ms 內完成
    if (Date.now() - tT > 600 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const days = getTripDays();
    if (dx < 0 && currentDayIdx < days.length - 1) { currentDayIdx++; renderTimeline(); }
    else if (dx > 0 && currentDayIdx > 0)          { currentDayIdx--; renderTimeline(); }
  }, { passive: true });

  // ── 地點卡：左滑超過 100px 即刪除（delWish 自帶復原 toast）──
  const pw = $('pg-wish');
  let wCard = null, wX = 0, wY = 0, wDx = 0, wLock = null;
  pw.addEventListener('touchstart', e => {
    wCard = null; wLock = null; wDx = 0;
    if (e.target.closest('input, button, a, select, textarea, .fav-heart')) return;
    const card = e.target.closest('.wish-card');
    if (!card || !card.dataset.wishId) return;
    wCard = card;
    const t = e.touches[0];
    wX = t.clientX; wY = t.clientY;
  }, { passive: true });
  pw.addEventListener('touchmove', e => {
    if (!wCard) return;
    const t = e.touches[0];
    const dx = t.clientX - wX, dy = t.clientY - wY;
    // 前 10px 判定滑動軸向，鎖定後才跟手位移，避免與垂直捲動打架
    if (wLock === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10))
      wLock = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    if (wLock !== 'x') return;
    wDx = Math.min(0, dx);   // 只允許往左
    wCard.style.transition = 'none';
    wCard.style.transform = `translateX(${wDx}px)`;
    wCard.style.opacity = String(Math.max(.35, 1 + wDx / 300));
  }, { passive: true });
  pw.addEventListener('touchend', () => {
    if (!wCard) return;
    const card = wCard, dx = wDx, lock = wLock;
    wCard = null;
    card.style.transition = 'transform .18s,opacity .18s';
    if (lock === 'x' && dx < -100) {
      card.style.transform = 'translateX(-110%)';
      card.style.opacity = '0';
      const id = card.dataset.wishId;
      setTimeout(() => delWish(id), 160);   // delWish 會重繪清單並顯示復原 toast
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
  }, { passive: true });
}

// =============================================================
//  DOMContentLoaded — 靜態事件綁定
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  if (window.__inAppBrowserBlocked) return; // 內嵌瀏覽器環境已顯示提醒畫面，不需要繼續初始化
  // Header
  on('proj-btn', 'click', toggleDD);

  // Onboarding
  on('btn-onboard-start', 'click', () => dismissOnboard(true));
  on('btn-onboard-skip',  'click', () => dismissOnboard(false));
  on('first-run-tip',     'click', openNewProj);

  // Tabs
  on('tb-home',     'click', () => showTab('home'));
  on('tb-wish',     'click', () => showTab('wish'));
  on('tb-timeline', 'click', () => showTab('timeline'));
  on('wish-fab',    'click', () => openWish());
  initGestures();

  // Banner
  on('mb-add-btn', 'click', quickAddWish);

  // Bottom bar
  on('btn-nav-route',  'click', openRouteNav);
  on('btn-open-export','click', openExport);
  on('btn-tour-replay', 'click', () => openTourMenu());   // header 教學導覽 → 章節選單
  on('tour-next', 'click', nextTourStep);
  on('tour-prev', 'click', prevTourStep);
  on('tour-skip', 'click', () => endTour(false));

  // Travel mode（事件委派）
  document.addEventListener('click', e => {
    const btn = e.target.closest('.travel-mode-btn');
    if (btn && !e.target.closest('.transit-tip')) setRouteMode(btn.dataset.mode);
  });

  // Modal closes
  ['proj','wish','sched','trip','export','route','conflict','batch','multi-sched','del-proj'].forEach(name => {
    on(`mc-${name}`, 'click', () => cm(`m-${name}`));
  });
  // conflict close 額外清 pending
  on('mc-conflict', 'click', () => { cm('m-conflict'); pendingProjObj = null; });

  // Modal saves
  on('save-proj-btn',  'click', saveProj);
  on('save-wish-btn',  'click', saveWish);
  on('save-sched-btn', 'click', saveSched);
  on('save-trip-btn',  'click', saveTrip);

  // Route
  on('mc-route',      'click', () => cm('m-route'));
  on('mc-members',    'click', () => cm('m-members'));
  on('btn-open-route','click', launchRoute);

  // Export
  on('export-sel-all',  'click', () => document.querySelectorAll('#export-days input').forEach(cb => cb.checked = true));
  on('export-sel-none', 'click', () => document.querySelectorAll('#export-days input').forEach(cb => cb.checked = false));
  on('btn-export-csv',  'click', exportCSV);
  on('btn-copy-text',   'click', copyText);
  on('btn-export-md',   'click', exportMarkdown);

  // Conflict
  on('btn-conflict-confirm', 'click', confirmConflict);

  // Batch
  on('mc-batch',        'click', () => cm('m-batch'));
  on('btn-batch-add-row','click', addBatchRow);
  on('btn-run-batch',   'click', runBatchImport);
  on('btn-paste-import','click', pasteImport);

  // Multi-sched
  on('mc-multi-sched',          'click', () => cm('m-multi-sched'));
  on('btn-multi-sched-confirm', 'click', saveMultiSched);

  // Del proj Modal
  on('mc-del-proj', 'click', () => { cm('m-del-proj'); delProjTarget = null; });
  on('btn-del-proj-confirm', 'click', execDelProj);
  on('del-proj-confirm-input', 'input', () => {
    const p = db.projects.find(x => x.id === delProjTarget);
    const val = $('del-proj-confirm-input').value;
    const btn = $('btn-del-proj-confirm');
    const ok  = p && val === p.name;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '.5';
    btn.style.cursor  = ok ? 'pointer' : 'not-allowed';
    btn.style.background = 'var(--coral)';
  });

  // Color picker
  document.querySelectorAll('.copt').forEach(el => {
    el.addEventListener('click', () => {
      sc = el.dataset.c;
      document.querySelectorAll('.copt').forEach(o => o.classList.remove('sel'));
      el.classList.add('sel');
    });
  });

  // Backdrop click to close modal
  document.querySelectorAll('.mwrap').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
  });

  // 注意：PWA 沒有 Maps content script，不需要監聽跨來源的 storage 變化通知

  // 鍵盤左右方向鍵切換日期（行程 Tab 有效）
  document.addEventListener('keydown', e => {
    if (at !== 'timeline') return;
    // 避免在 input/textarea/select 裡觸發
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    const days = getTripDays();
    if (!days.length) return;
    if (e.key === 'ArrowLeft' && currentDayIdx > 0) {
      currentDayIdx--;
      timelineView = 'day';
      renderTimeline();
      scrollActiveDateIntoView();
    } else if (e.key === 'ArrowRight' && currentDayIdx < days.length - 1) {
      currentDayIdx++;
      timelineView = 'day';
      renderTimeline();
      scrollActiveDateIntoView();
    }
  });

  // Auth 狀態初始化：等待 firebase-config.js（ES module）載入完成後才呼叫 loadDB
  if (window.getCurrentUser) {
    loadDB(); // firebase 模組已經就位（理論上 module 比 DOMContentLoaded 先跑完）
  } else {
    window.addEventListener('firebase-ready', () => loadDB(), { once: true });
  }
});

// =============================================================
//  Auth UI
// =============================================================
function updateAuthUI(knownUser) {
  const user = knownUser !== undefined ? knownUser : getCurrentUser();
  const btn    = $('auth-btn');
  const info   = $('auth-info');
  const avatar = $('auth-avatar');
  if (!btn) return;
  if (user) {
    if (info) info.textContent = user.email || '已登入';
    if (avatar) {
      const initial = (user.email || '?').trim().charAt(0).toUpperCase();
      avatar.textContent = initial;
      avatar.title = user.email || '';
    }
    btn.textContent = '登出';
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await signOut();
        stopWishlistSync();
        stopTripsSync();
        db = { projects: [], wishlist: {}, trips: {} };
        ap = null;
        const menu = $('auth-menu');
        if (menu) menu.style.display = 'none';
        await loadDB(); // 沒有登入了，loadDB 會自動切回登入閘門
      } catch(err) {
        console.warn('登出失敗', err);
      } finally {
        btn.disabled = false;
      }
    };
  } else {
    if (info) info.textContent = '未登入';
    if (avatar) { avatar.textContent = ''; avatar.title = ''; }
    btn.textContent = 'Google 登入同步';
    btn.onclick = () => doLogin(btn);
  }
}

// ── 帳號頭像：點擊切換選單顯示，點選單外面自動關閉 ──
document.addEventListener('click', (e) => {
  const avatar = $('auth-avatar');
  const menu   = $('auth-menu');
  if (!avatar || !menu) return;
  if (avatar.contains(e.target)) {
    menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'block' : 'none';
  } else if (!menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// ── 共用登入流程（閘門按鈕、側邊欄按鈕都呼叫這個）──
async function doLogin(triggerBtn) {
  const statusEl = $('login-gate-status');
  try {
    if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.textContent = '登入中…'; }
    if (statusEl) statusEl.textContent = '';
    await forceAccountSwitch();
    await signInWithGoogle();
    await loadDB();
  } catch(e) {
    console.warn('登入失敗', e);
    if (statusEl) statusEl.textContent = '登入失敗：' + (e.message || e.code || '未知錯誤');
    if (triggerBtn) { triggerBtn.textContent = '使用 Google 帳號登入'; triggerBtn.disabled = false; }
  }
}

// ── 登入閘門按鈕綁定 ──
document.addEventListener('DOMContentLoaded', () => {
  if (window.__inAppBrowserBlocked) return;
  const gateBtn = document.getElementById('login-gate-btn');
  if (gateBtn) gateBtn.onclick = () => doLogin(gateBtn);
});

// ── PWA: 註冊 Service Worker（提供離線快取）──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((registration) => {
      registration.update(); // 主動檢查是否有新版 sw.js，加速更新生效（不用等瀏覽器自然排程）
      registration.addEventListener('updatefound', () => {
        const nw = registration.installing;
        // 首次安裝時 controller 為 null，不需提示更新
        if (!nw || !navigator.serviceWorker.controller) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'activated') showUpdateBanner();
        });
      });
    }).catch(e => console.warn('Service Worker 註冊失敗', e));
  });
}

// 新版 Service Worker 啟用後顯示更新提示，點擊即重新載入取得新版頁面
function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const b = document.createElement('div');
  b.id = 'update-banner';
  b.textContent = '🔄 有新版本，點一下立即更新';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}

// ── 處理 signInWithRedirect 跳轉回來時的 back-forward cache 還原問題 ──
// 行動裝置走 redirect 登入流程：點擊按鈕→頁面跳轉→Google 登入→跳回本站。
// 某些瀏覽器（尤其 iOS Safari）會用 back-forward cache 還原跳轉前那一刻的畫面，
// 導致按鈕文字停留在「登入中…」。pageshow 事件搭配 event.persisted 可偵測這種還原，
// 強制重新跑一次 loadDB() 來修正畫面狀態。
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    console.log('[pageshow] 偵測到頁面從快取還原，重新整理登入狀態');
    loadDB();
  }
});

// =============================================================
//  Phase 2 — Invite & Join Mechanism (PWA)
// =============================================================

// ── Helpers ──────────────────────────────────────────────────

/** Generate a random 6-character alphanumeric code (uppercase). */
function _genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I for readability
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Check whether a code entry is still within its 24-hour TTL. */
function _isCodeValid(entry) {
  if (!entry || !entry.createdAt) return false;
  return (Date.now() - entry.createdAt) < 24 * 60 * 60 * 1000;
}

// ── Owner flow: open invite modal ────────────────────────────

// =============================================================
//  PWA Onboarding Tour (11 steps)
// =============================================================

const PWA_TOUR_STEPS = [
  { title: '歡迎使用旅程規劃！',
    tabSwitch: 'home',
    descHtml: '<p style="margin:0 0 8px">這是你的行動旅遊規劃工具，可以在手機上隨時管理地點、安排行程。</p><p style="margin:0">接下來帶你快速認識核心功能。</p>' },
  { title: '首頁：掌握旅程全局',
    target: '#pg-home', tabSwitch: 'home',
    descHtml: '<p style="margin:0">首頁顯示專案的出發日期、天數概覽，以及地點和行程的統計摘要。</p>' },
  { title: '專案切換與管理',
    target: '#proj-btn', tabSwitch: 'home',
    descHtml: '<p style="margin:0 0 8px">點這裡切換不同旅遊專案。</p><p style="margin:0">底部可以新增旅遊、邀請夥伴協作、或輸入邀請碼加入他人的專案。</p>' },
  { title: '準備清單：新增自訂項目',
    target: '.cl-add-row', tabSwitch: 'home',
    descHtml: '<p style="margin:0">選擇分類、輸入項目名稱，按 + 即可新增。打勾代表已完成準備。</p>' },
  { title: '準備清單：購買連結',
    target: '.cl-link', tabSwitch: 'home',
    descHtml: '<p style="margin:0">部分項目旁有「前往 ↗」按鈕，點擊即可直接前往購買網卡、票券等旅行必備品。</p>' },
  { title: '地點清單：收藏感興趣的地點',
    target: '#tb-wish', tabSwitch: 'wish',
    descHtml: '<p style="margin:0 0 8px">這裡集中管理所有想去的地方。可以按類別篩選、搜尋，也能排序找出最想去的。</p><p style="margin:0">準備排行程時，勾選地點再點「加入行程」。</p>' },
  { title: '地點卡片操作',
    target: '.wish-card', tabSwitch: 'wish',
    descHtml: `<p style="margin:0 0 8px">每個地點卡片上有三個快速操作：</p><div style="display:grid;grid-template-columns:24px 1fr;gap:2px 8px;margin-top:8px;align-items:center"><span style="color:var(--coral);font-size:15px;display:flex;justify-content:center">♥</span><span>收藏 — 標記最想去的地點</span><span style="display:flex;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span><span>編輯 — 修改名稱、類別、備註</span><span style="display:flex;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span><span>刪除 — 移除這個地點</span></div>` },
  { title: '行程安排：每日時間軸',
    target: '#tb-timeline', tabSwitch: 'timeline',
    descHtml: '<p style="margin:0 0 8px">從地點清單加入地點後，在這裡安排每天的順序與停留時長。</p><p style="margin:0">拖曳卡片可重新排序，接下來幾步介紹時間軸的重點功能。</p>' },
  { title: '切換日期',
    target: '#date-label-main', tabSwitch: 'timeline',
    descHtml: '<p style="margin:0">上方迷你日期列可直接跳到任一天，也可以在行程區左右滑動切換前後一天；右側「總覽」則一次綜覽整趟旅程。</p>' },
  { title: '出發時間與預計抵達',
    target: '#day-start-btn', tabSwitch: 'timeline',
    descHtml: '<p style="margin:0">點「🕘 出發」設定當天幾點出門，每張卡片會自動推算「⏱ 預計抵達」時間；有自訂時間的地點會成為錨點，後面的時間跟著重算。</p>' },
  { title: '移動時間與順路排序',
    target: '.transit-row', tabSwitch: 'timeline',
    descHtml: '<p style="margin:0">相鄰地點會自動估算移動時間：點分鐘數字可改成實際查到的時間，點紙飛機圖示會開啟 Google Maps 路線。移動時間明顯偏多時，上方會出現「一鍵順路排序」。</p>' },
  { title: '行程卡片操作',
    target: '.trip-card', tabSwitch: 'timeline',
    descHtml: `<p style="margin:0 0 8px">每張行程卡片提供四個操作：</p><div style="display:grid;grid-template-columns:24px 1fr;gap:2px 8px;margin-top:8px;align-items:center"><span style="display:flex;justify-content:center">${IC.grip}</span><span>拖曳 — 長按後上下移動可排序</span><span style="color:var(--coral);font-size:15px;display:flex;justify-content:center">♥</span><span>收藏 — 同步更新地點清單的收藏</span><span style="display:flex;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span><span>編輯 — 調整時間與停留時長</span><span style="display:flex;justify-content:center"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span><span>刪除 — 從今日行程移除</span></div>` },
  { title: '今日路線導航',
    target: '#btn-nav-route', tabSwitch: 'timeline',
    descHtml: '<p style="margin:0">點擊可開啟 Google Maps 導航，依照行程順序規劃最佳路線。</p>' },
  { title: '導覽完成！開始規劃旅程',
    descHtml: '<p style="margin:0 0 8px">你已經了解所有核心功能。</p><p style="margin:0">想再看一次？右上角的「教學導覽」按鈕隨時可以打開分章教學。</p>',
    isLast: true },
];

// New chapter: collaborating with trip-mates (not part of the original tour)
const COLLAB_STEPS = [
  { target: null, title: '一起規劃，即時同步',
    descHtml: '<p style="margin:0 0 8px">專案可以邀請旅伴共同編輯：任何人加地點、改行程，所有人的畫面即時更新。</p><p style="margin:0">邀請入口在專案選單裡。</p>',
    onEnter: () => showTab('home') },
  { target: '#btn-gen-invite', fallback: null, title: '產生邀請碼',
    descHtml: '<p style="margin:0 0 8px">點「產生新代碼」取得 6 位邀請碼，傳給旅伴即可。</p><p style="margin:0">代碼 24 小時內有效，過期再產生一次就好。</p>',
    onEnter: () => om('m-invite') },
  { target: null, title: '旅伴如何加入',
    descHtml: '<p style="margin:0 0 8px">旅伴在自己的裝置登入後，於專案選單選「輸入邀請碼」，貼上代碼即可加入專案。</p><p style="margin:0">每個帳號最多同時參與 3 個專案。</p>',
    onEnter: () => { cm('m-invite'); }, isLast: true },
];

// New chapter: mobile gestures (PWA-only)
const MOBILE_STEPS = [
  { target: '#wish-fab', tabSwitch: 'wish', title: '右下角＋：新增地點',
    descHtml: '<p style="margin:0">在地點清單頁，右下角的圓形按鈕可以隨時手動新增地點。</p>' },
  { target: '.wish-card', tabSwitch: 'wish', title: '左滑刪除',
    descHtml: '<p style="margin:0">地點卡片向左滑到底即可刪除；刪錯了沒關係，底部會出現「復原」。</p>' },
  { target: '#mini-date-bar', tabSwitch: 'timeline', title: '滑動切換天數',
    descHtml: '<p style="margin:0">行程頁左右滑動可切換前後一天，上方日期列可直接跳到任一天。</p>', isLast: true },
];

// Tour chapters: menu lets users replay just the section they need (Phase A indices)
// First-run task flow（手機版）：建立專案 → 收集地點 → 排行程。取代自動播放的完整導覽。
const PWA_FIRST_RUN_STEPS = [
  {
    title: '歡迎！先建立你的旅遊專案',
    tabSwitch: 'home',
    descHtml: '<p style="margin:0 0 8px">一個專案就是一趟旅程。先建立專案，之後收藏的地點、每日行程都會存在裡面，也能邀請旅伴一起編輯。</p>',
    actionHtml: '<button id="tour-create-proj" style="margin-top:8px;width:100%;font-size:12px;padding:9px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600">＋ 建立旅遊專案</button>',
    waiting: '完成建立後自動繼續…',
    advanceEvent: 'project-created',
    passthrough: true,       // 使用者要填新增專案表單，遮罩需穿透
    forcePos: 'top-right',   // 氣泡靠上，避免蓋住底部滑出的表單
  },
  {
    target: '#wish-fab', tabSwitch: 'wish',
    title: '收集想去的地點',
    descHtml: '<p style="margin:0 0 8px">右下角的＋可以手動新增地點；「新增多地點」能一次貼上多個名稱。</p><p style="margin:0">在電腦用 Chrome 擴充功能逛 Google Maps，按一下就能收藏，手機這裡即時同步。</p>',
  },
  {
    target: null, tabSwitch: 'timeline',
    title: '排入每日行程',
    descHtml: '<p style="margin:0">在地點清單勾選地點、按「加入行程」選日期，然後回到這裡調整每天的順序、停留與交通時間。</p>',
  },
  {
    title: '準備好了！',
    tabSwitch: 'home',
    descHtml: '<p style="margin:0 0 8px">首頁的「三步驟開始規劃」會陪你完成接下來的每一步。</p><p style="margin:0">想深入了解（旅伴協作、匯出、手機手勢），右上角的「教學導覽」按鈕有分章教學。</p>',
    isLast: true, hideSkip: true,
  },
];

const TOUR_CHAPTERS = [
  { id: 'collect',   label: '收藏地點', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-7.75 7-13a7 7 0 1 0-14 0c0 5.25 7 13 7 13z"/><circle cx="12" cy="8" r="2.5"/></svg>', steps: [PWA_TOUR_STEPS[5], PWA_TOUR_STEPS[6]] },
  { id: 'plan',      label: '安排行程', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>', steps: [PWA_TOUR_STEPS[7], PWA_TOUR_STEPS[8], PWA_TOUR_STEPS[9], PWA_TOUR_STEPS[10], PWA_TOUR_STEPS[11], PWA_TOUR_STEPS[12]] },
  { id: 'collab',    label: '旅伴協作', icon: IC.people, steps: COLLAB_STEPS },
  { id: 'mobile',    label: '手機操作', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>', steps: MOBILE_STEPS },
  { id: 'checklist', label: '準備清單', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="m9 14 2 2 4-4"/></svg>', steps: [PWA_TOUR_STEPS[3], PWA_TOUR_STEPS[4]] },
];

let tourActive = false, tourStep = 0;
let _activeTourSteps = PWA_TOUR_STEPS;

function startTour(steps = PWA_TOUR_STEPS) {
  dismissCtxHints(true);   // 收掉情境提示，避免與導覽互疊
  _activeTourSteps = steps;
  tourActive = true;
  tourStep = 0;
  renderTourStep();
}

function openTourMenu() {
  dismissCtxHints(true);
  $('tour-menu-list').innerHTML = TOUR_CHAPTERS.map(c =>
    `<button class="tour-chapter-btn" data-chapter="${c.id}" style="display:flex;align-items:center;gap:8px;text-align:left;padding:12px 14px;font-size:13px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer;color:var(--text);font-family:inherit">${c.icon || ''}<span>${c.label}</span></button>`).join('');
  $('tour-menu-list').querySelectorAll('[data-chapter]').forEach(b => b.addEventListener('click', () => {
    cm('m-tour-menu');
    startTour(TOUR_CHAPTERS.find(c => c.id === b.dataset.chapter).steps);
  }));
  $('mc-tour-menu').onclick = () => cm('m-tour-menu');
  om('m-tour-menu');
}

function endTour(completed = false) {
  tourActive = false;
  const overlay = document.getElementById('tour-overlay');
  if (overlay) overlay.classList.remove('active', 'passthrough');
  const spotlight = document.getElementById('tour-spotlight');
  if (spotlight) spotlight.style.cssText = '';
  cm('m-invite');
  if (completed) localStorage.setItem('tourDone', '1');
}

function getTourTargetRect(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  // 找得到但被隱藏（display:none / 已摺疊）視同找不到 → 退回全幕遮罩＋置中氣泡
  if (!el || (!el.offsetWidth && !el.offsetHeight)) return null;
  // 小螢幕：目標可能在折疊線下，量測前先捲入可視範圍
  try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  const r = el.getBoundingClientRect();
  return { top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 };
}

function renderTourStep() {
  const step = _activeTourSteps[tourStep];
  const overlay = document.getElementById('tour-overlay');
  const spotlight = document.getElementById('tour-spotlight');
  const bubble = document.getElementById('tour-bubble');
  if (!overlay || !spotlight || !bubble) return;

  // Tab auto-switch
  if (step.tabSwitch) showTab(step.tabSwitch);
  if (step.onEnter) step.onEnter();

  overlay.classList.add('active');
  // passthrough 步驟：關掉遮罩與點擊攔截，讓使用者能操作 app（如填寫新增專案表單）
  overlay.classList.toggle('passthrough', !!step.passthrough);

  // Progress
  const progressEl = document.getElementById('tour-progress');
  if (progressEl) {
    const pct = _activeTourSteps.length > 1 ? (tourStep / (_activeTourSteps.length - 1)) * 100 : 100;
    progressEl.style.width = pct + '%';
  }
  document.getElementById('tour-step-label').textContent = `步驟 ${tourStep + 1} / ${_activeTourSteps.length}`;
  document.getElementById('tour-title').textContent = step.title;
  const descEl = document.getElementById('tour-desc');
  if (step.descHtml) { descEl.style.whiteSpace = ''; descEl.innerHTML = step.descHtml; }
  else { descEl.style.whiteSpace = 'pre-line'; descEl.textContent = step.desc || ''; }

  // Optional action button（首次任務流程用，與 Extension 引擎同款）
  let actionEl = document.getElementById('tour-action');
  if (!actionEl) {
    actionEl = document.createElement('div');
    actionEl.id = 'tour-action';
    descEl.insertAdjacentElement('afterend', actionEl);
  }
  if (step.actionHtml) {
    actionEl.innerHTML = step.actionHtml;
    actionEl.style.display = 'block';
    const createProjBtn = actionEl.querySelector('#tour-create-proj');
    if (createProjBtn) createProjBtn.addEventListener('click', () => openNewProj());
  } else {
    actionEl.innerHTML = '';
    actionEl.style.display = 'none';
  }

  // Prev/Skip/Next buttons
  const prevBtn = document.getElementById('tour-prev');
  const skipBtn = document.getElementById('tour-skip');
  const nextBtn = document.getElementById('tour-next');
  if (prevBtn) prevBtn.style.display = tourStep > 0 ? '' : 'none';
  const _isLastStep = step.isLast || tourStep === _activeTourSteps.length - 1;
  if (skipBtn) skipBtn.style.display = _isLastStep ? 'none' : '';
  if (nextBtn) nextBtn.textContent = _isLastStep ? '開始使用' : '下一步';
  // 事件驅動的自動前進（如：建立專案完成後才繼續）
  if (nextBtn) nextBtn.style.display = step.advanceEvent ? 'none' : '';
  if (step.advanceEvent) {
    if (step.waiting) actionEl.insertAdjacentHTML('beforeend', `<div style="margin-top:8px;font-size:11px;color:var(--accent);font-weight:600">${step.waiting}</div>`);
    document.addEventListener(step.advanceEvent, () => { if (tourActive && _activeTourSteps[tourStep] === step) nextTourStep(); }, { once: true });
  }

  // Spotlight/bubble 定位：先立即定位一次，等動畫（bottom sheet 滑出、分頁切換）安定後再校正一次
  positionTourStep(step);
  setTimeout(() => { if (tourActive && _activeTourSteps[tourStep] === step) positionTourStep(step); }, 380);
}

function positionTourStep(step) {
  const spotlight = document.getElementById('tour-spotlight');
  const bubble = document.getElementById('tour-bubble');
  if (!spotlight || !bubble) return;
  requestAnimationFrame(() => {
    const rect = getTourTargetRect(step.target);
    if (rect) {
      spotlight.style.cssText = `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;display:block`;
      document.getElementById('tour-mask').style.display = 'none';
    } else {
      document.getElementById('tour-mask').style.display = 'block';
      spotlight.style.cssText = 'display:none';
    }
    // passthrough 步驟不顯示遮罩（使用者要操作底下的畫面）
    if (step.passthrough) document.getElementById('tour-mask').style.display = 'none';

    // Bubble positioning
    requestAnimationFrame(() => {
      const bRect = bubble.getBoundingClientRect();
      const vH = window.innerHeight;
      const vW = window.innerWidth;
      const M = 10;
      let top, left;
      if (step.forcePos === 'top-right') {
        top = M;
        left = vW - bRect.width - M;
      } else if (rect) {
        const belowTop = rect.top + rect.height + 10;
        const aboveTop = rect.top - bRect.height - 10;
        if (belowTop + bRect.height < vH - M) top = belowTop;
        else if (aboveTop >= M) top = aboveTop;
        else top = Math.max(M, Math.round((vH - bRect.height) / 2));
        left = Math.max(M, Math.min(rect.left, vW - bRect.width - M));
      } else {
        top = Math.max(M, Math.round((vH - bRect.height) / 2));
        left = Math.max(M, Math.round((vW - bRect.width) / 2));
      }
      top  = Math.min(top,  vH - bRect.height - M);
      left = Math.min(left, vW - bRect.width  - M);
      bubble.style.top  = `${Math.max(M, top)}px`;
      bubble.style.left = `${Math.max(M, left)}px`;
    });
  });
}

function nextTourStep() {
  if (tourStep < _activeTourSteps.length - 1) { tourStep++; renderTourStep(); }
  else endTour(true);
}
function prevTourStep() {
  if (tourStep > 0) { tourStep--; renderTourStep(); }
}

// ── Invite code cleanup (opportunistic, fire-and-forget) ──────────────────
async function cleanupExpiredInvites() {
  try {
    if (!window.listInviteCodes) return;
    const codes = await window.listInviteCodes();
    if (!codes) return;
    const now = Date.now();
    const TTL = 86400000; // 24 hours
    const expired = [];
    Object.entries(codes).forEach(([code, val]) => {
      const entry = typeof val === 'string' ? (() => { try { return JSON.parse(val); } catch { return null; } })() : val;
      if (!entry || !entry.createdAt || (now - entry.createdAt) > TTL) {
        expired.push(code);
      }
    });
    if (expired.length) {
      console.log(`[cleanup] Removing ${expired.length} expired invite code(s)`);
      await Promise.all(expired.map(c => window.deleteInviteCode(c)));
    }
  } catch(e) { console.warn('[cleanup] invite code cleanup failed', e); }
}

function openInviteModal() {
  if (!ap) { showToast('⚠️ Please select a project first.'); return; }
  const proj = db.projects.find(p => p.id === ap);
  if (!proj) return;

  $('invite-proj-name').textContent = proj.name;
  $('invite-code-display').textContent = '——————';
  $('invite-status').textContent = '';
  $('btn-gen-invite').disabled = false;
  $('btn-gen-invite').textContent = '產生新代碼';

  const authMenu = $('auth-menu');
  if (authMenu) authMenu.style.display = 'none';

  om('m-invite');
}

async function generateInviteCode() {
  if (!ap) return;
  const btn = $('btn-gen-invite');
  const statusEl = $('invite-status');
  btn.disabled = true;
  btn.textContent = '產生中…';
  statusEl.textContent = '';

  const code = _genCode();
  const ok = await window.writeInviteCode(code, ap);

  if (ok) {
    $('invite-code-display').textContent = code;
    statusEl.textContent = '代碼有效期限 24 小時';
    statusEl.style.color = 'var(--text3)';
  } else {
    statusEl.textContent = '⚠️ 產生失敗，請重試';
    statusEl.style.color = 'var(--coral)';
  }
  btn.textContent = '產生新代碼';
  btn.disabled = false;
}

async function copyInviteCode() {
  const code = $('invite-code-display').textContent.trim();
  if (!code || code.includes('—')) { showToast('請先產生邀請碼'); return; }
  try {
    await navigator.clipboard.writeText(code);
    showToast('✅ 已複製邀請碼');
  } catch {
    showToast('⚠️ 無法複製，請手動複製：' + code);
  }
}

// ── Guest flow: join modal ────────────────────────────────────

function openJoinModal() {
  $('join-code-input').value = '';
  $('join-status').textContent = '';
  $('join-status').style.color = 'var(--text3)';
  $('btn-join-confirm').disabled = false;
  $('btn-join-confirm').textContent = '確認加入';

  const authMenu = $('auth-menu');
  if (authMenu) authMenu.style.display = 'none';

  om('m-join');
}

async function joinProject() {
  const rawCode = ($('join-code-input').value || '').trim().toUpperCase();
  const statusEl = $('join-status');
  const btn = $('btn-join-confirm');

  if (rawCode.length !== 6) {
    statusEl.textContent = '請輸入 6 位邀請碼';
    statusEl.style.color = 'var(--coral)';
    return;
  }

  btn.disabled = true;
  btn.textContent = '加入中…';
  statusEl.textContent = '查詢邀請碼…';
  statusEl.style.color = 'var(--text3)';

  // 1. Read the invite code
  const entry = await window.readInviteCode(rawCode);
  if (!entry || !entry.pid) {
    statusEl.textContent = '⚠️ 邀請碼無效，請確認後重試';
    statusEl.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  // 2. Check 24h TTL
  if (!_isCodeValid(entry)) {
    statusEl.textContent = '⚠️ 邀請碼已過期，請向夥伴索取新代碼';
    statusEl.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  const pid = entry.pid;

  // 3. Check the user is not already a member
  const existing = db.projects.find(p => p.id === pid);
  if (existing) {
    statusEl.textContent = `✅ 您已經是「${existing.name}」的成員`;
    statusEl.style.color = 'var(--accent)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  // 3b. Check 3-project cap
  if (db.projects.length >= 3) {
    statusEl.textContent = '已達專案上限（最多 3 個）';
    statusEl.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  // 4. Resolve current user
  const user = getCurrentUser();
  if (!user) {
    statusEl.textContent = '⚠️ 尚未登入，請先登入';
    statusEl.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  // 5. Write self into /projects/${pid}/members/${uid}
  const memberOk = await window.projPatch(pid, `members/${user.uid}`, { role: 'member', nickname: '', displayName: user.displayName || user.email || '' });
  if (!memberOk) {
    statusEl.textContent = '⚠️ 無法加入專案，請重試或聯繫擁有者';
    statusEl.style.color = 'var(--coral)';
    btn.disabled = false; btn.textContent = '確認加入';
    return;
  }

  // 7. Add project to own user index
  await window.userProjectsAdd(pid);

  // 8. Reload DB so the new project appears immediately
  statusEl.textContent = '✅ 已加入！載入專案中…';
  statusEl.style.color = 'var(--accent)';

  const cloud = await window.fbRead();
  if (cloud && cloud.projects) {
    db = cloud;
    if (!db.wishlist) db.wishlist = {};
    if (!db.trips) db.trips = {};
    ap = pid;
    chrome.storage.local.set({ activeProject: ap });
  }

  cm('m-join');
  renderAll();
  showTab('home');
  showToast('🎉 You have joined the project!');
}

// ── Wire up event listeners ───────────────────────────────────
// (appended to run after the main DOMContentLoaded block initialises)

(function wirePhase2() {
  function tryBind() {
    const inviteModal = document.getElementById('m-invite');
    if (!inviteModal) { setTimeout(tryBind, 200); return; } // wait for DOM

    on('mc-invite',        'click', () => cm('m-invite'));
    on('btn-gen-invite',   'click', generateInviteCode);
    on('btn-copy-invite',  'click', copyInviteCode);

    on('mc-join',          'click', () => cm('m-join'));
    on('btn-join-confirm', 'click', joinProject);

    // Auto-uppercase join input + Enter key
    const joinInput = document.getElementById('join-code-input');
    if (joinInput) {
      joinInput.addEventListener('input', () => {
        const pos = joinInput.selectionStart;
        joinInput.value = joinInput.value.toUpperCase();
        joinInput.setSelectionRange(pos, pos);
      });
      joinInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') joinProject();
      });
    }

    // Backdrop-click-to-close for new modals
    ['m-invite', 'm-join'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBind);
  } else {
    tryBind();
  }
})();
