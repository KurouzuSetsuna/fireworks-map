// ============================================================
// 定数
// ============================================================
const AREAS = ['全国', '北海道', '東北', '関東', '中部', '近畿', '中国四国', '九州沖縄'];

const MARKER_RADIUS = (scale) => {
  if (!scale || scale === 0) return 10;
  if (scale < 5000) return 14;
  if (scale < 20000) return 20;
  return 26;
};

// ============================================================
// ユーティリティ
// ============================================================

/** HTMLエンティティをエスケープしてXSSを防ぐ */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** YYYY-MM-DD文字列を {year, month, day} に分解（タイムゾーン依存を回避） */
function parseDate(dateStr) {
  const parts = dateStr.split('-').map(Number);
  return { year: parts[0], month: parts[1], day: parts[2] };
}

// ============================================================
// 状態
// ============================================================
let allData = [];
let state = {
  year: null,
  area: '全国',
  month: null,  // null = 全月
  week: null,   // null = 全週
};

let map = null;
let markersLayer = null;

// ============================================================
// 地図初期化
// ============================================================
function initMap() {
  map = L.map('map').setView([36.5, 137.5], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

// ============================================================
// データ読み込み
// ============================================================
async function loadData() {
  try {
    const res = await fetch('data/hanabi.json');
    if (!res.ok) throw new Error('fetch failed');
    allData = await res.json();
  } catch (e) {
    showMapMessage('データを読み込めませんでした');
    return false;
  }
  return true;
}

// ============================================================
// エラー・空状態
// ============================================================
function showMapMessage(text) {
  const el = document.getElementById('map-message');
  el.textContent = text;
  el.style.display = 'block';
}

function hideMapMessage() {
  document.getElementById('map-message').style.display = 'none';
}

// ============================================================
// エントリーポイント
// ============================================================
async function main() {
  initMap();
  const ok = await loadData();
  if (!ok) return;

  buildYearSelector();
  buildAreaFilters();
  applyDefaultYearMonth();
  buildMonthFilters();
  buildWeekFilters();
  renderMarkers();
}

document.addEventListener('DOMContentLoaded', main);

// ============================================================
// 年セレクター
// ============================================================
function buildYearSelector() {
  const years = [...new Set(allData.map(d => parseDate(d.date).year))].sort();
  if (!years.length) return;
  const sel = document.getElementById('year-select');
  sel.innerHTML = '';
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '年';
    sel.appendChild(opt);
  });

  // デフォルト年: 今年があれば今年、なければ最新年
  const thisYear = new Date().getFullYear();
  state.year = years.includes(thisYear) ? thisYear : years[years.length - 1];
  sel.value = state.year;

  sel.addEventListener('change', () => {
    state.year = parseInt(sel.value, 10);
    state.month = null;
    state.week = null;
    applyDefaultYearMonth();
    buildMonthFilters();
    buildWeekFilters();
    renderMarkers();
  });
}

// ============================================================
// デフォルト年月
// ============================================================
function applyDefaultYearMonth() {
  const thisMonth = new Date().getMonth() + 1; // 1-12
  const yearData = allData.filter(d => parseDate(d.date).year === state.year);

  // 今月にデータがあれば今月、なければ次にデータがある月
  const months = [...new Set(yearData.map(d => parseDate(d.date).month))].sort((a, b) => a - b);
  if (months.length === 0) {
    state.month = null;
    return;
  }
  if (months.includes(thisMonth)) {
    state.month = thisMonth;
  } else {
    // 今月より後で最初の月、なければ最初の月（今月は既にデータなしと確認済みなので > を使う）
    const future = months.filter(m => m > thisMonth);
    state.month = future.length > 0 ? future[0] : months[0];
  }
  state.week = null;
}

// ============================================================
// エリアフィルター
// ============================================================
function buildAreaFilters() {
  const container = document.getElementById('area-filters');
  container.innerHTML = '';
  AREAS.forEach(area => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn' + (state.area === area ? ' active' : '');
    btn.textContent = area;
    btn.addEventListener('click', () => {
      state.area = area;
      document.querySelectorAll('#area-filters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderMarkers();
    });
    container.appendChild(btn);
  });
}

// ============================================================
// 月フィルター
// ============================================================
function buildMonthFilters() {
  const container = document.getElementById('month-filters');
  container.innerHTML = '';
  const yearData = allData.filter(d => parseDate(d.date).year === state.year);
  const months = [...new Set(yearData.map(d => parseDate(d.date).month))].sort((a, b) => a - b);

  // 「全月」ボタン
  const allBtn = createFilterBtn('全月', state.month === null, () => {
    state.month = null;
    state.week = null;
    refreshMonthButtons();
    buildWeekFilters();
    renderMarkers();
  });
  container.appendChild(allBtn);

  months.forEach(m => {
    const btn = createFilterBtn(m + '月', state.month === m, () => {
      state.month = m;
      state.week = null;
      refreshMonthButtons();
      buildWeekFilters();
      renderMarkers();
    });
    btn.dataset.month = m;
    container.appendChild(btn);
  });
}

function refreshMonthButtons() {
  document.querySelectorAll('#month-filters .filter-btn').forEach(btn => {
    const m = btn.dataset.month ? parseInt(btn.dataset.month) : null;
    btn.classList.toggle('active', m === state.month);
  });
}

function createFilterBtn(label, isActive, onClick) {
  const btn = document.createElement('button');
  btn.className = 'filter-btn' + (isActive ? ' active' : '');
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

// ============================================================
// 週フィルター
// ============================================================
function buildWeekFilters() {
  const section = document.getElementById('week-section');
  const container = document.getElementById('week-filters');
  container.innerHTML = '';

  if (state.month === null) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const weeks = getWeeksInMonth(state.year, state.month);

  const allBtn = createFilterBtn('全週', state.week === null, () => {
    state.week = null;
    refreshWeekButtons();
    renderMarkers();
  });
  container.appendChild(allBtn);

  weeks.forEach((w, i) => {
    const label = `第${i + 1}週`;
    const btn = createFilterBtn(label, state.week === i + 1, () => {
      state.week = i + 1;
      refreshWeekButtons();
      renderMarkers();
    });
    btn.dataset.week = i + 1;
    container.appendChild(btn);
  });
}

function getWeeksInMonth(year, month) {
  // 第N週: 1-7日, 8-14日, 15-21日, 22-28日, 29-末日
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks = [];
  for (let start = 1; start <= daysInMonth; start += 7) {
    weeks.push({ start, end: Math.min(start + 6, daysInMonth) });
  }
  return weeks;
}

function refreshWeekButtons() {
  document.querySelectorAll('#week-filters .filter-btn').forEach(btn => {
    const w = btn.dataset.week ? parseInt(btn.dataset.week) : null;
    btn.classList.toggle('active', w === state.week);
  });
}

// ============================================================
// フィルタリング
// ============================================================
function filterData() {
  return allData.filter(d => {
    const { year, month, day } = parseDate(d.date);

    if (year !== state.year) return false;
    if (state.area !== '全国' && d.area !== state.area) return false;
    if (state.month !== null && month !== state.month) return false;
    if (state.week !== null) {
      const weekStart = (state.week - 1) * 7 + 1;
      const weekEnd = Math.min(weekStart + 6, new Date(year, month, 0).getDate());
      if (day < weekStart || day > weekEnd) return false;
    }
    return true;
  });
}

// ============================================================
// マーカー描画
// ============================================================
function renderMarkers() {
  markersLayer.clearLayers();
  const filtered = filterData();

  if (filtered.length === 0) {
    showMapMessage('条件に一致する花火大会がありません');
    renderEventList([]);
    return;
  }
  hideMapMessage();

  filtered.forEach(d => {
    const radius = MARKER_RADIUS(d.scale);
    const circle = L.circleMarker([d.lat, d.lng], {
      radius,
      color: '#ffd700',
      fillColor: '#ff6b35',
      fillOpacity: 0.8,
      weight: 2,
    });

    // イベントIDをマーカーに保存
    circle.eventId = d.id;

    const scaleText = d.scale ? d.scale.toLocaleString() + '発' : '不明';
    // URLはhttps://またはhttp://のみ許可（javascript:などを排除）
    const safeUrl = d.url && /^https?:\/\//.test(d.url) ? d.url : null;
    const urlLink = safeUrl
      ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">公式サイト →</a>`
      : '';
    const popupContent = `
      <div class="popup-content">
        <strong>${escapeHtml(d.name)}</strong><br>
        📅 ${escapeHtml(d.date)}<br>
        📍 ${escapeHtml(d.prefecture)}<br>
        🎆 ${escapeHtml(scaleText)}<br>
        ${urlLink}
      </div>
    `;
    circle.bindPopup(popupContent);
    markersLayer.addLayer(circle);
  });

  renderEventList(filtered);
}

// ============================================================
// 花火大会リスト描画
// ============================================================
function renderEventList(events) {
  const container = document.getElementById('event-list');
  container.innerHTML = '';

  if (events.length === 0) {
    container.innerHTML = '<div style="color: #b0b0b0; font-size: 0.75rem; text-align: center;">該当する花火大会がありません</div>';
    return;
  }

  // 日付順にソート
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  sorted.forEach(event => {
    const item = document.createElement('div');
    item.className = 'event-item';

    const scaleText = event.scale ? event.scale.toLocaleString() + '発' : '規模不明';

    item.innerHTML = `
      <div class="event-item-name">${escapeHtml(event.name)}</div>
      <div class="event-item-details">
        📅 ${escapeHtml(event.date)}<br>
        📍 ${escapeHtml(event.prefecture)}<br>
        🎆 ${escapeHtml(scaleText)}
      </div>
    `;

    // クリックで地図にズーム
    item.addEventListener('click', () => {
      map.setView([event.lat, event.lng], 12);
      // イベントIDでマーカーを探してポップアップを開く
      markersLayer.eachLayer(layer => {
        if (layer.eventId === event.id) {
          layer.openPopup();
        }
      });
    });

    container.appendChild(item);
  });
}
