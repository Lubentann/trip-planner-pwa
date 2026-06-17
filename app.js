// ── chrome.* API 相容層（PWA 環境用標準 Web API 模擬，避免跟瀏覽器原生 window.chrome 物件衝突）──
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
const CC    = { 景點:'t-teal', 交通:'t-amber', 住宿:'t-blue', 餐廳:'t-coral', 購物:'t-amber', 其他:'t-teal' };
const DUR   = { 30:'30分', 60:'1小時', 90:'1.5小時', 120:'2小時', 180:'3小時', 240:'3小時+' };
const WKDAY = ['日','一','二','三','四','五','六'];

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
let pendingProjObj = null;
let routeTrips   = [];
let routeMode    = 'driving';
let multiSchedIds = [];
let undoState     = null;  // { type:'wish'|'trip', data, ap }
let undoTimer     = null;
let delProjTarget = null;  // 待刪除的專案 id
let wishFilter    = { cat: 'all', sort: 'rating', query: '' };

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
//  Stars widget  ← 抽共用，消除 wishlist / timeline 重複
// =============================================================

/**
 * 產生星星評分 HTML 字串。
 * @param {string} containerId  - CSS class 前綴（'wish-inline-stars' or 'trip-stars'）
 * @param {string} starClass    - 每顆星的 class（'wish-star' or 'trip-star'）
 * @param {string} wishId
 * @param {number} rating
 */
function buildStarsHtml(containerClass, starClass, wishId, rating) {
  const stars = [1, 2, 3, 4, 5].map(i =>
    `<span class="${starClass}" data-val="${i}" style="font-size:14px;color:${i <= rating ? '#f59e0b' : 'var(--border2)'}">★</span>`
  ).join('');
  return `<div class="${containerClass}" data-wish-id="${wishId}" data-rating="${rating}" style="display:inline-flex;gap:2px;cursor:pointer;align-items:center">${stars}</div>`;
}

/**
 * 對已渲染的星星容器綁定 hover / click 事件。
 * @param {Element} container  - 包含所有星星的父層
 * @param {string}  starClass  - 星星的 class 名稱
 * @param {Function} onRate    - async (wishId, newRating) => void
 */
function bindStars(container, starClass, onRate) {
  const wishId = container.dataset.wishId;
  container.querySelectorAll(`.${starClass}`).forEach(star => {
    star.addEventListener('mouseenter', () => {
      const v = Number(star.dataset.val);
      container.querySelectorAll(`.${starClass}`).forEach(s =>
        s.style.color = Number(s.dataset.val) <= v ? '#f59e0b' : 'var(--border2)'
      );
    });
    star.addEventListener('mouseleave', () => {
      const cur = Number(container.dataset.rating);
      container.querySelectorAll(`.${starClass}`).forEach(s =>
        s.style.color = Number(s.dataset.val) <= cur ? '#f59e0b' : 'var(--border2)'
      );
    });
    star.addEventListener('click', async e => {
      e.stopPropagation();
      const v = Number(star.dataset.val);
      container.dataset.rating = v;
      container.querySelectorAll(`.${starClass}`).forEach(s =>
        s.style.color = Number(s.dataset.val) <= v ? '#f59e0b' : 'var(--border2)'
      );
      await onRate(wishId, v);
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

  await loadPending();
  renderAll();
  showTab('home');
  console.log('[loadDB] 確認登入狀態:', user ? user.email : '未登入', '即將呼叫 updateAuthUI');
  updateAuthUI(user);

  if (!db.projects.length && !r.onboardDone) {
    setTimeout(() => om('m-onboard'), 400);
  } else if (!db.projects.length) {
    $('first-run-tip').classList.add('show');
  }

  const openCount = (r.openCount || 0) + 1;
  chrome.storage.local.set({ openCount });
}

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

async function loadPending() {
  const r = await chrome.storage.local.get(['pendingPlace']);
  if (r.pendingPlace && r.pendingPlace.name) {
    pending = r.pendingPlace;
    await chrome.storage.local.remove('pendingPlace');
    showBanner();
  }
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
  $('new-btn').style.background   = color;
}

// ── 專案下拉（事件委派，避免每次 render 重複綁定）──
function renderDD() {
  const el = $('dd');
  if (!db.projects.length) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text3);font-size:12px">點 + 新增旅遊專案</div>';
    return;
  }
  el.innerHTML = db.projects.map(p => `
    <div class="pi ${p.id === ap ? 'active' : ''}" data-proj="${p.id}">
      <div class="pdot" style="background:${p.color || '#2d6a4f'}"></div>
      <div class="pinfo">
        <div class="pn">${esc(p.name)}</div>
        <div class="pm">${esc(p.destination || '')}${p.startDate ? ' · ' + p.startDate : ''}${p.endDate ? '～' + p.endDate : ''}</div>
      </div>
      <button class="pedit" data-edit-proj="${p.id}" title="編輯">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="pdel" data-del-proj="${p.id}" title="刪除">✕</button>
    </div>`).join('');

  // 事件委派：一個 listener 處理所有行
  el.addEventListener('click', e => {
    const delBtn  = e.target.closest('.pdel');
    const editBtn = e.target.closest('.pedit');
    const row     = e.target.closest('.pi');
    if (delBtn)       { e.stopPropagation(); delProj(delBtn.dataset.delProj); }
    else if (editBtn) { e.stopPropagation(); editProj(editBtn.dataset.editProj); }
    else if (row)     { selProj(row.dataset.proj); }
  }, { once: true }); // once: true 讓每次 renderDD 只綁一次新 listener
}

// =============================================================
//  Home tab
// =============================================================
function renderHome() {
  const p  = db.projects.find(x => x.id === ap);
  const el = $('pg-home');
  if (!p) {
    el.innerHTML = `<div class="empty"><div class="ei">✈️</div><p>點右上角 + 新增你的<br>第一個旅遊專案</p></div>`;
    return;
  }

  const wishes  = (db.wishlist[ap] || []).length;
  const trips   = (db.trips[ap] || []).length;
  const allDays = getTripDays();
  const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${y}/${m}/${dd}`; };
  const dateStr = p.startDate ? `${fmtDate(p.startDate)} ～ ${fmtDate(p.endDate)}` : '';

  // 倒數天數計算
  let countdownHtml = '';
  if (p.startDate) {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(p.startDate); start.setHours(0,0,0,0);
    const end   = p.endDate ? new Date(p.endDate) : null;
    if (end) end.setHours(0,0,0,0);
    const diff = Math.round((start - today) / 86400000);
    if (diff > 0)       countdownHtml = `<div class="countdown-badge">✈️ 距出發還有 ${diff} 天</div>`;
    else if (diff === 0) countdownHtml = `<div class="countdown-badge" style="background:var(--coral-l);color:var(--coral)">🎉 今天出發！</div>`;
    else if (end && today <= end) {
      const dayNum = Math.round((today - start) / 86400000) + 1;
      countdownHtml = `<div class="countdown-badge" style="background:var(--blue-l);color:var(--blue)">📍 旅途中 Day ${dayNum}</div>`;
    } else if (end && today > end) {
      countdownHtml = `<div class="countdown-badge" style="background:var(--surface2);color:var(--text3)">✅ 旅程已結束</div>`;
    }
  }

  // 進度條：已安排天數 / 總天數
  let progHtml = '';
  if (allDays.length) {
    const scheduledDays = allDays.filter(d => (db.trips[ap] || []).some(t => t.date === d)).length;
    const pct = Math.round(scheduledDays / allDays.length * 100);
    progHtml = `<div class="prog-bar-wrap">
      <div class="prog-bar-label"><span>行程完整度</span><span>${scheduledDays}／${allDays.length} 天已安排</span></div>
      <div class="prog-bar-track"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  // 每日摘要
  const summaryHtml = allDays.map((d, i) => {
    const dayTrips = sortedDayTrips(d);
    const [y2, m2, d2] = d.split('-').map(Number);
    const wk    = WKDAY[new Date(y2, m2 - 1, d2).getDay()];
    const label = `Day ${i + 1}  ${m2}/${d2}（週${wk}）`;
    if (!dayTrips.length) return `<div class="day-summary" data-idx="${i}"><div class="ds-label">${label}</div><div class="ds-names ds-empty">尚未安排</div></div>`;
    const LIMIT = 22;
    let names = '', count = 0;
    for (const t of dayTrips) {
      const candidate = names + (names ? '・' : '') + t.name;
      if (candidate.length > LIMIT) break;
      names = candidate; count++;
    }
    const rest = dayTrips.length - count;
    if (rest > 0) names += `…等 ${dayTrips.length} 個`;
    return `<div class="day-summary" data-idx="${i}"><div class="ds-label">${label}</div><div class="ds-names">${names}</div></div>`;
  }).join('');

  el.innerHTML = `
    <div style="padding:16px 0 8px">
      <div style="font-size:26px;font-weight:700;margin-bottom:4px;letter-spacing:-.3px">${esc(p.name)}</div>
      ${p.destination ? `<div style="font-size:12px;color:var(--text3);margin-bottom:2px">${esc(p.destination)}</div>` : ''}
      ${dateStr ? `<div style="font-size:12px;color:var(--text3);margin-bottom:10px">${dateStr}</div>` : '<div style="margin-bottom:10px"></div>'}
      ${countdownHtml}
      <div class="hstats">
        <div class="hstat hstat-click" data-goto="wish"><div class="hsv">${wishes}</div><div class="hsl">願望清單</div></div>
        <div class="hstat"><div class="hsv">${allDays.length}</div><div class="hsl">天行程</div></div>
        <div class="hstat hstat-click" data-goto="timeline"><div class="hsv">${trips}</div><div class="hsl">地點安排</div></div>
      </div>
      ${progHtml}
      ${allDays.length ? `<div style="margin-top:8px">${summaryHtml}</div>` : ''}
    </div>`;

  el.querySelectorAll('.hstat-click').forEach(s => s.addEventListener('click', () => showTab(s.dataset.goto)));
  el.querySelectorAll('.day-summary').forEach(s => s.addEventListener('click', () => {
    currentDayIdx = Number(s.dataset.idx); showTab('timeline');
  }));
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

  const wishes = db.wishlist[ap] || [];
  const el     = $('pg-wish');

  // 取得所有類別
  const allCats = [...new Set(wishes.map(w => w.category))];

  let html = `<div class="shd"><h2>願望清單</h2><div style="display:flex;gap:6px"><button class="add-btn batch" id="wish-batch-btn">多地點匯入</button><button class="add-btn" id="wish-add-btn">新增地點</button></div></div>`;

  // 搜尋欄 + 篩選 chips
  html += `<div id="wish-search-row">
    <input id="wish-search" placeholder="搜尋地點…" value="${esc(wishFilter.query)}">
  </div>
  <div id="wish-filter-bar">
    <button class="filter-chip ${wishFilter.cat === 'all' ? 'active' : ''}" data-filter-cat="all">全部</button>
    ${allCats.map(c => `<button class="filter-chip ${wishFilter.cat === c ? 'active' : ''}" data-filter-cat="${esc(c)}">${esc(c)}</button>`).join('')}
    <button class="filter-chip ${wishFilter.cat === 'unscheduled' ? 'active' : ''}" data-filter-cat="unscheduled">未排入</button>
    <div style="flex:1"></div>
    <select id="wish-sort" style="font-size:11px;padding:3px 6px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer">
      <option value="rating" ${wishFilter.sort==='rating'?'selected':''}>按評分</option>
      <option value="newest" ${wishFilter.sort==='newest'?'selected':''}>最新加入</option>
      <option value="name"   ${wishFilter.sort==='name'  ?'selected':''}>名稱排序</option>
      <option value="unscheduled" ${wishFilter.sort==='unscheduled'?'selected':''}>未排入優先</option>
    </select>
  </div>`;

  if (!wishes.length) {
    el.innerHTML = html + `<div class="empty"><div class="ei">⭐</div><p>還沒有地點<br>在 Google Maps 點底部按鈕加入</p></div>`;
    bindWishControls(el);
    return;
  }

  // 套用搜尋 + 篩選
  let filtered = [...wishes];
  if (wishFilter.query) {
    const q = wishFilter.query.toLowerCase();
    filtered = filtered.filter(w => w.name.toLowerCase().includes(q) || (w.note || '').toLowerCase().includes(q));
  }
  if (wishFilter.cat === 'unscheduled') {
    filtered = filtered.filter(w => !(db.trips[ap] || []).some(t => t.wishId === w.id));
  } else if (wishFilter.cat !== 'all') {
    filtered = filtered.filter(w => w.category === wishFilter.cat);
  }

  // 排序
  if (wishFilter.sort === 'rating') {
    filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  } else if (wishFilter.sort === 'newest') {
    filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (wishFilter.sort === 'name') {
    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW'));
  } else if (wishFilter.sort === 'unscheduled') {
    filtered.sort((a, b) => {
      const aS = (db.trips[ap] || []).some(t => t.wishId === a.id) ? 1 : 0;
      const bS = (db.trips[ap] || []).some(t => t.wishId === b.id) ? 1 : 0;
      return aS - bS || (b.rating || 0) - (a.rating || 0);
    });
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
      const rating = w.rating || 3;
      const starsHtml = buildStarsHtml('wish-inline-stars', 'wish-star', w.id, rating);
      const scheduledBadge = dayStr ? `<span class="sched-done-tag">已排 ${dayStr}</span>` : '';

      html += `<div class="card wish-card" data-wish-id="${w.id}">
        <div class="vc-row1">
          <input type="checkbox" class="wish-check" data-wish-id="${w.id}">
          <span class="vc-name">${esc(w.name)}</span>
          <span class="tag ${CC[w.category] || 't-teal'}" style="flex-shrink:0;margin-right:auto">${esc(w.category)}</span>
          <button class="ib" data-edit-wish="${w.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="ib del" data-del-wish="${w.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
        <div class="vc-row2">
          <span class="vc-dur">${DUR[w.duration] || w.duration + '分'}</span>
          ${starsHtml}
        </div>
        <div class="vc-row3" style="justify-content:space-between;align-items:flex-end">
          <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              ${w.mapUrl ? `<a class="vc-map" href="${esc(w.mapUrl)}" target="_blank">地圖</a>` : ''}
              ${scheduledBadge}
            </div>
            ${w.note ? `<div class="vc-note">${esc(w.note)}</div>` : ''}
          </div>
          <button class="sched-btn" style="flex-shrink:0;align-self:flex-end" data-sched="${w.id}">加入行程</button>
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
}

function bindWishControls(el) {
  on('wish-add-btn',  'click', () => openWish());
  on('wish-batch-btn','click', openBatchImport);

  // 搜尋
  const searchInput = $('wish-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      wishFilter.query = searchInput.value;
      renderWish();
    });
  }
  // 篩選 chips
  el.querySelectorAll('[data-filter-cat]').forEach(btn => btn.addEventListener('click', () => {
    wishFilter.cat = btn.dataset.filterCat;
    renderWish();
  }));
  // 排序
  const sortSel = $('wish-sort');
  if (sortSel) sortSel.addEventListener('change', () => { wishFilter.sort = sortSel.value; renderWish(); });

  el.querySelectorAll('[data-edit-wish]').forEach(b => b.addEventListener('click', () => editWish(b.dataset.editWish)));
  el.querySelectorAll('[data-del-wish]').forEach(b  => b.addEventListener('click', () => delWish(b.dataset.delWish)));
  el.querySelectorAll('[data-sched]').forEach(b     => b.addEventListener('click', () => openSched(b.dataset.sched)));

  // 星星評分
  el.querySelectorAll('.wish-inline-stars').forEach(container => {
    bindStars(container, 'wish-star', async (wishId, v) => {
      const w = (db.wishlist[ap] || []).find(x => x.id === wishId);
      if (!w) return;
      w.rating = v;
      await saveDB();
      if (at === 'timeline') renderTimeline();
    });
  });

  // 多選
  function updateMultiBar() {
    const checked = [...el.querySelectorAll('.wish-check:checked')];
    const bar = $('wish-multi-bar');
    if (bar) bar.style.display = checked.length ? 'flex' : 'none';
    const lbl = $('wish-sel-label');
    if (lbl) lbl.textContent = `已選 ${checked.length} 個地點`;
  }
  el.querySelectorAll('.wish-check').forEach(cb => cb.addEventListener('change', updateMultiBar));
  on('wish-sel-all',  'click', () => { el.querySelectorAll('.wish-check').forEach(cb => cb.checked = true);  updateMultiBar(); });
  on('wish-sel-clear','click', () => { el.querySelectorAll('.wish-check').forEach(cb => cb.checked = false); updateMultiBar(); });
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
    el.innerHTML = `<div class="empty" style="margin-top:20px"><div class="ei">🗓</div><p>請先在專案中設定出發與結束日期</p></div>`;
    $('timeline-bar').classList.remove('show');
    return;
  }
  if (currentDayIdx >= days.length) currentDayIdx = 0;
  $('timeline-bar').classList.add('show');

  // 渲染前儲存 mini-date-bar 的 scrollLeft
  const prevScrollLeft = $('mini-date-bar') ? $('mini-date-bar').scrollLeft : 0;

  // 迷你日期欄（所有天）
  const miniBar = days.map((d, i) => {
    const cnt = (db.trips[ap] || []).filter(t => t.date === d).length;
    const [, m, dd] = d.split('-').map(Number);
    const badge = cnt ? `<div class="mini-day-badge">${cnt}</div>` : `<div style="height:14px"></div>`;
    return `<button class="mini-day-btn ${i === currentDayIdx && timelineView === 'day' ? 'active' : ''}" data-mini-day="${i}">
      <div class="mdb-d">${m}/${dd}</div>
      ${badge}
    </button>`;
  }).join('');

  // 全覽 / 單日 切換
  const viewToggle = `<div class="view-toggle">
    <button class="vt-btn ${timelineView==='day'?'active':''}" id="vt-day">單日</button>
    <button class="vt-btn ${timelineView==='overview'?'active':''}" id="vt-overview">全覽</button>
  </div>`;

  let html = `
    <div id="mini-date-bar">${miniBar}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:4px 0 8px">
      <div id="date-label-main" style="font-size:12px;font-weight:600;color:var(--text)">${timelineView==='overview' ? `全部 ${days.length} 天` : fmtDayLabel(days[currentDayIdx], currentDayIdx, days.length)}</div>
      ${viewToggle}
    </div>`;

  if (timelineView === 'overview') {
    $('timeline-bar').classList.remove('show');
    // 全覽模式
    const maxCount = Math.max(1, ...days.map(d => (db.trips[ap] || []).filter(t => t.date === d).length));
    html += `<div id="timeline-overview" class="show">`;
    days.forEach((d, i) => {
      const dayTrips = sortedDayTrips(d);
      const [, m, dd] = d.split('-').map(Number);
      const wk = WKDAY[new Date(...d.split('-').map(Number).map((v,j)=>j===1?v-1:v)).getDay()];
      const label = `Day ${i+1}  ${m}/${dd}（週${wk}）`;
      const pct = maxCount ? Math.round(dayTrips.length / maxCount * 100) : 0;
      const names = dayTrips.map(t => t.name).join('・') || '尚未安排';
      const totalMin = dayTrips.reduce((s, t) => s + (Number(t.duration) || 0), 0);
      const timeStr = totalMin ? `${Math.floor(totalMin/60)}h${totalMin%60?totalMin%60+'m':''}` : '';
      html += `<div class="ov-day" data-ov-idx="${i}">
        <div class="ov-day-hd">
          <div class="ov-day-label">${label}</div>
          <div class="ov-day-count">${dayTrips.length} 個地點${timeStr?' · '+timeStr:''}</div>
        </div>
        <div class="ov-day-spots">${esc(names)}</div>
        ${dayTrips.length ? `<div class="ov-day-bar" style="width:${pct}%"></div>` : ''}
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
    const timeSummary = totalMin
      ? `<div class="day-time-summary">共 <span class="hl">${dayTrips.length}</span> 個地點 · 預計 <span class="hl">${Math.floor(totalMin/60) > 0 ? Math.floor(totalMin/60) + ' 小時' : ''}${totalMin%60 > 0 ? totalMin%60 + ' 分' : ''}</span></div>`
      : '';

    html += `<div class="shd" style="margin-top:0"><h2>行程</h2><button class="add-btn" id="timeline-add-btn">從願望清單新增</button></div>`;
    html += timeSummary;

    if (!dayTrips.length) {
      html += `<div class="empty" style="padding:24px 0"><div class="ei">📍</div><p>今天還沒有行程<br>從願望清單排入</p></div>`;
    } else {
      html += `<div id="trip-list">`;
      dayTrips.forEach(t => {
        const wishItem = t.wishId ? (db.wishlist[ap] || []).find(x => x.id === t.wishId) : null;
        const rating   = wishItem ? wishItem.rating || 3 : 0;
        const dispCat  = wishItem ? wishItem.category : t.category;
        const dispNote = wishItem ? wishItem.note : t.note;
        const starsHtml = rating ? buildStarsHtml('trip-stars', 'trip-star', t.wishId, rating) : '';
        html += `<div class="card trip-card" draggable="true" data-trip-id="${t.id}">
          <div class="vc-row1">
            <div class="drag-handle" title="拖曳排序">⠿</div>
            <span class="vc-name">${esc(t.name)}</span>
            <span class="tag ${CC[dispCat] || 't-teal'}" style="flex-shrink:0;margin-right:auto">${esc(dispCat)}</span>
            <button class="ib" data-edit-trip="${t.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="ib del" data-del-trip="${t.id}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
          </div>
          <div class="vc-row2">
            ${t.time ? `<span class="vc-meta">${t.time}</span><span class="vc-meta">·</span>` : ''}
            <span class="vc-dur">${DUR[t.duration] || t.duration + '分'}</span>
            ${starsHtml}
          </div>
          ${t.mapUrl ? `<div class="vc-row3"><a class="vc-map" href="${esc(t.mapUrl)}" target="_blank">地圖</a></div>` : ''}
          ${dispNote ? `<div class="vc-note">${esc(dispNote)}</div>` : ''}
        </div>`;
      });
      html += `</div>
      <button class="add-btn" id="timeline-add-btn-bottom" style="width:100%;justify-content:center;margin-top:6px;background:var(--surface2);color:var(--text);border:1px solid var(--border)">＋ 從願望清單新增</button>`;
    }
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

  on('timeline-add-btn', 'click', () => showTab('wish'));
  on('timeline-add-btn-bottom', 'click', () => showTab('wish'));
  el.querySelectorAll('[data-edit-trip]').forEach(b => b.addEventListener('click', () => editTrip(b.dataset.editTrip)));
  el.querySelectorAll('[data-del-trip]').forEach(b  => b.addEventListener('click', () => delTrip(b.dataset.delTrip)));

  // 星星評分
  el.querySelectorAll('.trip-stars').forEach(container => {
    if (!container.dataset.wishId) return;
    bindStars(container, 'trip-star', async (wishId, v) => {
      const w = (db.wishlist[ap] || []).find(x => x.id === wishId);
      if (!w) return;
      w.rating = v;
      await saveDB();
      if (at === 'wish') renderWish();
    });
  });

  if ($('trip-list')) initDragSort($('trip-list'), days[currentDayIdx]);
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
  let dragging = null, dragOverCard = null, insertBefore = true, placeholder = null;

  function getPlaceholder() {
    if (placeholder && placeholder.parentNode) return placeholder;
    placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder-card';
    return placeholder;
  }
  function removePlaceholder() { if (placeholder && placeholder.parentNode) placeholder.remove(); }
  function clearHints() { list.querySelectorAll('.trip-card').forEach(c => c.classList.remove('drag-target')); removePlaceholder(); }

  list.querySelectorAll('.trip-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragging = card;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.tripId);
      requestAnimationFrame(() => card.classList.add('dragging'));
    });

    card.addEventListener('dragend', async () => {
      card.classList.remove('dragging');
      clearHints();
      if (!dragging || !dragOverCard || dragging === dragOverCard) { dragging = null; dragOverCard = null; return; }
      if (placeholder && placeholder.parentNode) {
        list.insertBefore(dragging, placeholder);
        removePlaceholder();
      } else {
        if (insertBefore) list.insertBefore(dragging, dragOverCard);
        else dragOverCard.insertAdjacentElement('afterend', dragging);
      }
      dragging = null; dragOverCard = null;
      const newOrder = [...list.querySelectorAll('.trip-card')].map(c => c.dataset.tripId);
      newOrder.forEach((id, i) => { const t = (db.trips[ap] || []).find(x => x.id === id); if (t) t.order = i; });
      await saveDB();
    });

    card.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (!dragging || dragging === card) return;
      dragOverCard = card;
      const rect = card.getBoundingClientRect();
      insertBefore = e.clientY < rect.top + rect.height / 2;
      const ph = getPlaceholder();
      ph.style.height = dragging.offsetHeight + 'px';
      if (insertBefore) { if (card.previousSibling !== ph) list.insertBefore(ph, card); }
      else              { if (card.nextSibling !== ph)     card.insertAdjacentElement('afterend', ph); }
    });

    card.addEventListener('drop', e => e.preventDefault());
  });

  list.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragging) return;
    const ph = getPlaceholder();
    if (!ph.parentNode) list.appendChild(ph);
  });

  list.addEventListener('dragleave', e => {
    if (!list.contains(e.relatedTarget)) { clearHints(); dragOverCard = null; }
  });
}

// =============================================================
//  Route navigation
// =============================================================
function extractWaypoint(t) {
  if (!t.mapUrl) return t.name;
  const m = t.mapUrl.match(/place\/([^/@?]+)/);
  return m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : t.name;
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
      ? `<button id="btn-transit-open-all" style="width:100%;background:var(--accent);color:#fff;border:none;border-radius:var(--r);padding:9px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:8px">🗺 一次開啟全部路線（${links.length} 段）</button>`
      : '';

    $('transit-links').innerHTML = skippedNotice + openAllBtn + links.map(l =>
      `<a class="transit-seg" data-url="${esc(l.url)}">${l.first ? '🔗 ' : '📍 '}${esc(l.label)}</a>`
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
    close.textContent = '✕';
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

function exportCSV() {
  const p = db.projects.find(x => x.id === ap) || {};
  const checked = getCheckedDays();
  if (!checked.length) { showToast('請選擇要匯出的天'); return; }

  const rows = [['專案','日期','Day','星期','地點名稱','類別','時間','停留時間','備註','Maps連結']];
  checked.forEach(({ date, idx }) => {
    const [y, m, d] = date.split('-').map(Number);
    const wk = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
    const dayTrips = sortedDayTrips(date);   // 統一使用共用函式
    if (!dayTrips.length) {
      rows.push([p.name || '', date, `Day ${idx + 1}`, `週${wk}`, '（無行程）', '', '', '', '', '']);
    } else {
      dayTrips.forEach(t => {
        rows.push([p.name || '', date, `Day ${idx + 1}`, `週${wk}`, t.name, t.category || '', t.time || '', DUR[t.duration] || '', t.note || '', t.mapUrl || '']);
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

  let text = `✈️ ${p.name || '旅遊行程'}`;
  if (p.destination) text += `｜${p.destination}`;
  text += '\n';

  checked.forEach(({ date, idx }) => {
    const [y, m, d] = date.split('-').map(Number);
    const wk = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
    const dayTrips = sortedDayTrips(date);   // 統一使用共用函式
    text += `\n🗓 Day ${idx + 1}｜${m}月${d}日（週${wk}）\n`;
    if (!dayTrips.length) {
      text += '（尚未安排行程）\n';
    } else {
      dayTrips.forEach(t => {
        text += `📍 ${t.time ? t.time + ' ' : ''}${t.name}（${DUR[t.duration] || ''}）`;
        if (t.note) text += `\n   └ ${t.note}`;
        text += '\n';
      });
      const total = dayTrips.reduce((s, t) => s + (Number(t.duration) || 0), 0);
      const hrs = Math.floor(total / 60), mins = total % 60;
      text += `共 ${dayTrips.length} 個地點｜預計 ${hrs > 0 ? hrs + '小時' : ''}${mins > 0 ? mins + '分' : ''}\n`;
    }
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

  let md = `# ✈️ ${p.name || '旅遊行程'}\n`;
  if (p.destination) md += `**目的地**：${p.destination}  \n`;
  if (dateRange)     md += `**日期**：${dateRange}  \n`;
  md += '\n---\n';

  checked.forEach(({ date, idx }) => {
    const [y, m, d] = date.split('-').map(Number);
    const wk = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
    const dayTrips = sortedDayTrips(date);
    const total = dayTrips.reduce((s, t) => s + (Number(t.duration) || 0), 0);
    const hrs = Math.floor(total / 60), mins = total % 60;
    const timeStr = total ? `（預計 ${hrs > 0 ? hrs + ' 小時' : ''}${mins > 0 ? mins + ' 分' : ''}）` : '';

    md += `\n## Day ${idx + 1}　${m}月${d}日（週${wk}）${timeStr}\n\n`;

    if (!dayTrips.length) {
      md += '_尚未安排行程_\n';
    } else {
      dayTrips.forEach((t, i) => {
        const time = t.time ? `**${t.time}**　` : '';
        const dur  = DUR[t.duration] ? `（${DUR[t.duration]}）` : '';
        const cat  = t.category ? ` \`${t.category}\`` : '';
        const link = t.mapUrl ? ` [📍 地圖](${t.mapUrl})` : '';
        md += `${i + 1}. ${time}${t.name}${dur}${cat}${link}\n`;
        if (t.note) md += `   > ${t.note}\n`;
      });
    }
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
  // 離開願望清單時隱藏多選工具列並清除勾選
  if (t !== 'wish') {
    const bar = $('wish-multi-bar');
    if (bar) bar.style.display = 'none';
    document.querySelectorAll('.wish-check:checked').forEach(cb => cb.checked = false);
  }
  if (t === 'home')       renderHome();
  else if (t === 'wish')     renderWish();
  else if (t === 'timeline') renderTimeline();
  else $('timeline-bar').classList.remove('show');
  closeDD();
}

function toggleDD() { const d = $('dd'), b = $('proj-btn'); const o = d.classList.toggle('open'); b.classList.toggle('open', o); }
function closeDD()  { $('dd').classList.remove('open'); $('proj-btn').classList.remove('open'); }
function selProj(id) {
  ap = id; currentDayIdx = 0;
  wishFilter = { cat: 'all', sort: 'rating', query: '' };
  closeDD(); renderAll(); showTab('home');
  chrome.storage.local.set({ activeProject: id });
}

// =============================================================
//  Project CRUD
// =============================================================
function openNewProj() {
  eid = null;
  $('mpt').textContent = '新旅遊';
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
  else { db.projects.push(obj); ap = obj.id; chrome.storage.local.set({ activeProject: obj.id }); }
  await saveDB(); renderAll(); showTab('home'); cm('m-proj');
  updateFirstRunTip();
}

function delProj(id) {
  const p = db.projects.find(x => x.id === id);
  if (!p) return;
  delProjTarget = id;
  $('del-proj-name').textContent = p.name;
  $('del-proj-confirm-input').value = '';
  const btn = $('btn-del-proj-confirm');
  btn.disabled = true; btn.style.opacity = '.5'; btn.style.cursor = 'not-allowed';
  closeDD();
  om('m-del-proj');
}

async function execDelProj() {
  if (!delProjTarget) return;
  const id = delProjTarget; delProjTarget = null;
  db.projects = db.projects.filter(p => p.id !== id);
  delete db.wishlist[id]; delete db.trips[id];
  if (ap === id) ap = db.projects[0]?.id || null;
  await saveDB(); cm('m-del-proj'); renderAll(); showTab('home');
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
  await saveDB(); renderWish(); cm('m-wish');
  if (at === 'timeline') renderTimeline();
  setTimeout(() => {
    const card = document.querySelector(`.wish-card[data-wish-id="${newId}"]`);
    if (card) { card.classList.add('highlight'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }, 40);
}

async function delWish(id) {
  const w = (db.wishlist[ap] || []).find(x => x.id === id);
  if (!w) return;
  const snapshot = JSON.parse(JSON.stringify(w));
  const snapAp   = ap;
  db.wishlist[ap] = (db.wishlist[ap] || []).filter(x => x.id !== id);
  await saveDB();
  renderWish();
  showUndoToast(`已刪除「${w.name}」`, async () => {
    if (!db.wishlist[snapAp]) db.wishlist[snapAp] = [];
    db.wishlist[snapAp].unshift(snapshot);
    await saveDB();
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
  $('sc-days').innerHTML = days.map((d, i) =>
    `<div class="day-check" data-date="${d}" data-dur="${w.duration || 60}"><input type="checkbox" data-date="${d}" data-dur="${w.duration || 60}"><span>${fmtDayLabel(d, i, days.length)}</span></div>`
  ).join('');
  $('sc-days').querySelectorAll('.day-check').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') { const cb = row.querySelector('input'); cb.checked = !cb.checked; }
      updateSlots();
    });
  });
  $('sc-slots').innerHTML = ''; om('m-sched');
}

function slotEntryHTML(time = '', dur = 60, note = '') {
  const durOpts = Object.entries(DUR).map(([v, l]) => `<option value="${v}"${String(v) === String(dur) ? ' selected' : ''}>${l}</option>`).join('');
  return `<div class="slot-entry" style="margin-bottom:8px">
    <div class="frow" style="margin-bottom:4px">
      <div class="f" style="margin:0"><label>出發時間</label><input type="time" class="slot-time" value="${time}"></div>
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
      <div class="day-slot-hd"><span>${date}</span><button class="add-slot-btn" data-slot-date="${date}">＋ 再加一次</button></div>
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
    }, 60);
  }
  const dayLabels = [...new Set(newIds.map(n => n.date))].map(d => {
    const days = getTripDays(); const idx = days.indexOf(d);
    const [,m,dd] = d.split('-').map(Number);
    return idx >= 0 ? `Day ${idx+1}（${m}/${dd}）` : d;
  }).join('、');
  showToast(`✅ 已排入 ${dayLabels}`);
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
  if (!db.wishlist[ap]) db.wishlist[ap] = [];
  [...items].reverse().forEach(item => {
    db.wishlist[ap].unshift({ id: item.id, name: item.name, mapUrl: item.mapUrl, category: '景點', rating: 3, duration: 60, note: '', createdAt: Date.now() });
  });
  await saveDB();
  showToast(`✅ 已匯入 ${items.length} 個地點`);
  cm('m-batch');
  showTab('wish');
  // renderWish 是同步的，等下一個 frame 再找 card
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      items.forEach(item => {
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
  $('multi-sched-days').innerHTML = days.map((d, i) =>
    `<div class="day-check" data-date="${d}"><input type="checkbox" data-date="${d}"><span>${fmtDayLabel(d, i, days.length)}</span></div>`
  ).join('');
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
//  DOMContentLoaded — 靜態事件綁定
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Header
  on('proj-btn', 'click', toggleDD);
  on('new-btn',  'click', openNewProj);

  // Onboarding
  on('btn-onboard-start', 'click', () => dismissOnboard(true));
  on('btn-onboard-skip',  'click', () => dismissOnboard(false));
  on('first-run-tip',     'click', openNewProj);
  on('btn-reload-maps',   'click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0] && /maps\.google|google\.com\/maps|maps\.app\.goo\.gl/.test(tabs[0].url)) {
        chrome.tabs.reload(tabs[0].id);
        showToast('✅ Google Maps 重整中…');
      } else {
        chrome.tabs.create({ url: 'https://www.google.com/maps' });
      }
    });
  });

  // Tabs
  on('tb-home',     'click', () => showTab('home'));
  on('tb-wish',     'click', () => showTab('wish'));
  on('tb-timeline', 'click', () => showTab('timeline'));

  // Banner
  on('mb-add-btn', 'click', quickAddWish);

  // Bottom bar
  on('btn-nav-route',  'click', openRouteNav);
  on('btn-open-export','click', openExport);

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

  // Storage listener（content.js 透過 background.js 寫入 Firebase 後，側邊欄重新拉取雲端資料）
  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.pendingPlace?.newValue?.name) {
      pending = changes.pendingPlace.newValue;
      chrome.storage.local.remove('pendingPlace');
      showBanner();
    }
    if (changes.switchToWish?.newValue) {
      chrome.storage.local.remove('switchToWish');
      const cloud = await fbRead();
      if (cloud && cloud.projects) {
        db = cloud;
        if (!db.wishlist) db.wishlist = {};
        if (!db.trips) db.trips = {};
      }
      showTab('wish');
      setTimeout(() => {
        const card = document.querySelector('.wish-card');
        if (card) { card.classList.add('highlight'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      }, 40);
    }
  });

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
  const btn  = $('auth-btn');
  const info = $('auth-info');
  if (!btn) return;
  if (user) {
    if (info) info.textContent = user.email || '已登入';
    btn.textContent = '登出';
    btn.onclick = async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await signOut();
        db = { projects: [], wishlist: {}, trips: {} };
        ap = null;
        await loadDB(); // 沒有登入了，loadDB 會自動切回登入閘門
      } catch(err) {
        console.warn('登出失敗', err);
      } finally {
        btn.disabled = false;
      }
    };
  } else {
    if (info) info.textContent = '未登入';
    btn.textContent = 'Google 登入同步';
    btn.onclick = () => doLogin(btn);
  }
}

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
  const gateBtn = document.getElementById('login-gate-btn');
  if (gateBtn) gateBtn.onclick = () => doLogin(gateBtn);
});

// ── PWA: 註冊 Service Worker（提供離線快取）──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service Worker 註冊失敗', e));
  });
}
