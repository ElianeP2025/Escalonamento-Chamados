const SUPABASE_FUNCTIONS_BASE = 'https://vvgsbosvzwxpftmdbhje.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'sb_publishable_rO8Q_hsZ8rdFlvJr7UgYig_7DGfNvzm';
const TIME_ZONE = 'America/Sao_Paulo';

const THEME_STORAGE_KEY = 'escalonamento_theme';
const CONFIG_STORAGE_KEY = 'escalonamento_last_config';

const DEFAULT_CONFIG = {
  analysts: [
    { id: 'fernando', name: 'Fernando', initials: 'FE' },
    { id: 'david', name: 'David', initials: 'DA' },
    { id: 'gabriel', name: 'Gabriel', initials: 'GA' }
  ],
  shifts: [
    { analystId: 'fernando', startMinute: 420, endMinute: 960 },  // 07:00 - 16:00
    { analystId: 'david', startMinute: 480, endMinute: 1020 },    // 08:00 - 17:00
    { analystId: 'gabriel', startMinute: 660, endMinute: 1200 }   // 11:00 - 20:00
  ]
};

let state = {
  calls: [],
  queue_turn: 0,
  config: structuredCloneSafe(DEFAULT_CONFIG)
};

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function minutesToHHMM(mins) {
  const safe = Math.max(0, Number(mins) || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${pad(h)}:${pad(m)}`;
}

function hhmmToMinutes(str) {
  const value = String(str || '').trim();
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);

  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return h * 60 + m;
}

function normalizeConfig(config) {
  const analystsRaw = Array.isArray(config?.analysts) ? config.analysts : [];
  const shiftsRaw = Array.isArray(config?.shifts) ? config.shifts : [];

  const analysts = analystsRaw
    .map((a, index) => {
      const id = String(a?.id || `analyst_${index + 1}`).trim();
      const name = String(a?.name || `Analista ${index + 1}`).trim();
      const initials = String(a?.initials || name.slice(0, 2)).trim().toUpperCase();
      return { id, name, initials };
    })
    .filter(a => a.id && a.name);

  const shifts = shiftsRaw
    .map((item) => ({
      analystId: String(item?.analystId || '').trim(),
      startMinute: Number(item?.startMinute),
      endMinute: Number(item?.endMinute)
    }))
    .filter(item =>
      item.analystId &&
      Number.isFinite(item.startMinute) &&
      Number.isFinite(item.endMinute) &&
      item.startMinute < item.endMinute
    )
    .sort((a, b) => a.startMinute - b.startMinute || a.analystId.localeCompare(b.analystId));

  if (!analysts.length) {
    return structuredCloneSafe(DEFAULT_CONFIG);
  }

  return {
    analysts,
    shifts: shifts.length ? shifts : structuredCloneSafe(DEFAULT_CONFIG.shifts)
  };
}

function saveConfigToLocal(config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (_) {}
}

function loadConfigFromLocal() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return normalizeConfig(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) {}

  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch (_) {
    return 'light';
  }
}

function applyTheme(theme, persist = true) {
  const body = document.body;
  if (!body) return;

  body.dataset.theme = theme === 'dark' ? 'dark' : 'light';

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, body.dataset.theme);
    } catch (_) {}
  }

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', body.dataset.theme === 'dark' ? 'true' : 'false');
    btn.setAttribute(
      'title',
      body.dataset.theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'
    );
  }
}

function initThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  applyTheme(getPreferredTheme(), false);

  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.body?.dataset?.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  });
}

function getBrazilNowParts() {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const map = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second
  };
}


function nowMinutesOfDay() {
  const n = getBrazilNowParts();
  return Number(n.hour) * 60 + Number(n.minute);
}


function nowClockStr() {
  const n = getBrazilNowParts();
  return `${n.hour}:${n.minute}:${n.second}`;
}

function todayStr() {
  const n = getBrazilNowParts();
  return `${n.year}-${n.month}-${n.day}`;
}

function getTypeClass(type) {
  return String(type).toUpperCase() === 'WO' ? 'wo' : 'inc';
}

function getTypeLabel(type) {
  return String(type).toUpperCase() === 'WO' ? 'WO' : 'Incidente';
}

function getAnalystById(id) {
  return (state.config?.analysts || []).find(a => a.id === id) || null;
}

function getAnalystThemeClassByIndex(index) {
  if (index % 3 === 0) return 'af';
  if (index % 3 === 1) return 'ag';
  return 'ax';
}

function getAnalystBadgeClass(name) {
  const analysts = state.config?.analysts || [];
  const index = analysts.findIndex(a => a.name === name);
  if (index % 3 === 0) return 'F';
  if (index % 3 === 1) return 'G';
  return 'X';
}

// ------------------------------------------------------------
// Lógica de carga e prioridade
// ------------------------------------------------------------

/**
 * Monta um mapa de contagem por analista: { id -> { wo: N, inc: N } }
 */
function buildLoadMap(todayCalls) {
  const analysts = state.config?.analysts || [];
  const map = new Map();

  analysts.forEach(a => map.set(a.id, { wo: 0, inc: 0 }));

  todayCalls.forEach(call => {
    // O campo analyst_id pode não existir em registros antigos — usa fallback pelo nome
    const analyst = analysts.find(a =>
      a.id === call.analyst_id || a.name === call.analyst
    );
    if (!analyst) return;

    const entry = map.get(analyst.id);
    if (!entry) return;

    if (String(call.type).toUpperCase() === 'WO') {
      entry.wo++;
    } else {
      entry.inc++;
    }
  });

  return map;
}

/**
 * Retorna os analistas ativos agora, ordenados por startMinute (desempate por nome).
 */
function getActiveAnalystsNow() {
  const minutesNow = nowMinutesOfDay();
  const analysts = state.config?.analysts || [];
  const shifts = state.config?.shifts || [];

  return shifts
    .filter(shift => minutesNow >= shift.startMinute && minutesNow < shift.endMinute)
    .map((shift) => {
      const analyst = analysts.find(a => a.id === shift.analystId);
      if (!analyst) return null;
      return {
        ...analyst,
        startMinute: shift.startMinute,
        endMinute: shift.endMinute
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMinute - b.startMinute || a.name.localeCompare(b.name));
}

/**
 * Retorna o próximo analista para um tipo específico (WO ou Incidente).
 * Prioridade: menor contagem do tipo → desempate por startMinute.
 */
function getNextAnalystForType(type, loadMap) {
  const active = getActiveAnalystsNow();
  if (!active.length) return null;

  const isWO = String(type).toUpperCase() === 'WO';

  return [...active].sort((a, b) => {
    const loadA = loadMap.get(a.id) ?? { wo: 0, inc: 0 };
    const loadB = loadMap.get(b.id) ?? { wo: 0, inc: 0 };

    const countA = isWO ? loadA.wo : loadA.inc;
    const countB = isWO ? loadB.wo : loadB.inc;

    if (countA !== countB) return countA - countB;
    return a.startMinute - b.startMinute;
  })[0];
}

/**
 * Retorna a fila ordenada para um tipo, do próximo ao último.
 */
function buildQueueForType(type, loadMap) {
  const active = getActiveAnalystsNow();
  if (!active.length) return [];

  const isWO = String(type).toUpperCase() === 'WO';

  return [...active].sort((a, b) => {
    const loadA = loadMap.get(a.id) ?? { wo: 0, inc: 0 };
    const loadB = loadMap.get(b.id) ?? { wo: 0, inc: 0 };

    const countA = isWO ? loadA.wo : loadA.inc;
    const countB = isWO ? loadB.wo : loadB.inc;

    if (countA !== countB) return countA - countB;
    return a.startMinute - b.startMinute;
  });
}

// ------------------------------------------------------------
// Funções de render
// ------------------------------------------------------------

function computeTodayLoads(todayCalls, analysts) {
  const map = new Map();

  analysts.forEach(a => {
    map.set(a.name, { total: 0, wo: 0, inc: 0 });
  });

  todayCalls.forEach(call => {
    const current = map.get(call.analyst) || { total: 0, wo: 0, inc: 0 };
    current.total += 1;

    if (String(call.type).toUpperCase() === 'WO') current.wo += 1;
    else current.inc += 1;

    map.set(call.analyst, current);
  });

  return map;
}

function renderScheduleDynamic() {
  const container = document.getElementById('schedule-dynamic');
  if (!container) return;

  const analysts = state.config?.analysts || [];
  const shifts = state.config?.shifts || [];

  if (!analysts.length) {
    container.innerHTML = '<div class="empty">Nenhum analista configurado</div>';
    return;
  }

  if (!shifts.length) {
    container.innerHTML = '<div class="empty">Nenhum turno configurado</div>';
    return;
  }

  const dayStart = 7 * 60;
  const dayEnd = 20 * 60;
  const totalMinutes = dayEnd - dayStart;

  const hourLabels = [];
  for (let hour = 7; hour <= 20; hour++) {
    hourLabels.push(`${pad(hour)}:00`);
  }

  const rows = shifts.map((shift) => {
    const analyst = analysts.find(a => a.id === shift.analystId);
    if (!analyst) return '';

    const analystIndex = analysts.findIndex(a => a.id === analyst.id);
    const cls = getAnalystThemeClassByIndex(analystIndex);

    const left = ((shift.startMinute - dayStart) / totalMinutes) * 100;
    const width = ((shift.endMinute - shift.startMinute) / totalMinutes) * 100;

    return `
      <div class="shift-row">
        <div class="shift-name">${escapeHtml(analyst.name)}</div>
        <div class="shift-track">
          <div
            class="shift-bar ${cls}"
            style="left:${left}%;width:${width}%"
            title="${escapeHtml(analyst.name)} · ${minutesToHHMM(shift.startMinute)} às ${minutesToHHMM(shift.endMinute)}"
          ></div>
        </div>
        <div class="shift-time">${minutesToHHMM(shift.startMinute)}–${minutesToHHMM(shift.endMinute)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="timeline-header">
      <div></div>
      <div class="timeline-hour-labels">${hourLabels.map(h => `<span>${h}</span>`).join('')}</div>
      <div></div>
    </div>
    <div class="shift-list">${rows}</div>
  `;
}

function renderDebtArea(todayCalls) {
  const debtArea = document.getElementById('debt-area');
  if (!debtArea) return;

  const analysts = state.config?.analysts || [];
  if (!analysts.length) {
    debtArea.innerHTML = '';
    return;
  }

  const loadMap = buildLoadMap(todayCalls);

  // Calcula diferença para WO e Incidente separadamente
  const woValues = analysts.map(a => (loadMap.get(a.id) ?? { wo: 0 }).wo);
  const incValues = analysts.map(a => (loadMap.get(a.id) ?? { inc: 0 }).inc);

  const woDiff = Math.max(...woValues) - Math.min(...woValues);
  const incDiff = Math.max(...incValues) - Math.min(...incValues);

  if (woDiff === 0 && incDiff === 0) {
    debtArea.innerHTML = `
      <div class="debt-note">
        Carga equilibrada. <span>Todos os analistas estão com o mesmo total de chamados hoje.</span>
      </div>
    `;
    return;
  }

  const parts = [];

  if (woDiff > 0) {
    const minWO = Math.min(...woValues);
    const maxWO = Math.max(...woValues);
    const lower = analysts.filter(a => (loadMap.get(a.id) ?? { wo: 0 }).wo === minWO).map(a => a.name).join(', ');
    const higher = analysts.filter(a => (loadMap.get(a.id) ?? { wo: 0 }).wo === maxWO).map(a => a.name).join(', ');
    parts.push(`WO: diferença de <span>${woDiff}</span> (menos: <span>${escapeHtml(lower)}</span> · mais: <span>${escapeHtml(higher)}</span>)`);
  }

  if (incDiff > 0) {
    const minInc = Math.min(...incValues);
    const maxInc = Math.max(...incValues);
    const lower = analysts.filter(a => (loadMap.get(a.id) ?? { inc: 0 }).inc === minInc).map(a => a.name).join(', ');
    const higher = analysts.filter(a => (loadMap.get(a.id) ?? { inc: 0 }).inc === maxInc).map(a => a.name).join(', ');
    parts.push(`Inc: diferença de <span>${incDiff}</span> (menos: <span>${escapeHtml(lower)}</span> · mais: <span>${escapeHtml(higher)}</span>)`);
  }

  debtArea.innerHTML = `
    <div class="debt-note">${parts.join(' &nbsp;·&nbsp; ')}</div>
  `;
}

function updateZoneBadge() {
  const badge = document.getElementById('zone-badge');
  const dot = document.getElementById('live-dot');
  const zt = document.getElementById('zone-text');

  if (!badge || !dot || !zt) return;

  const active = getActiveAnalystsNow();
  const baseStyle = 'border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;';

  if (!active.length) {
    badge.style.cssText = `background:var(--zone-off-bg);color:var(--zone-off-txt);${baseStyle}`;
    dot.style.background = 'var(--zone-off-dot)';
    zt.textContent = 'Fora do horário';
    return;
  }

  badge.style.cssText = `background:var(--zone-on-bg);color:var(--zone-on-txt);${baseStyle}`;
  dot.style.background = 'var(--zone-on-dot)';
  zt.textContent = `Ativos agora: ${active.map(a => a.name).join(', ')}`;
}

function renderQueueArea(todayCalls) {
  const qv = document.getElementById('queue-visual');
  const nextWo = document.getElementById('next-wo');
  const nextInc = document.getElementById('next-inc');
  const noteWo = document.getElementById('note-wo');
  const noteInc = document.getElementById('note-inc');

  if (!qv || !nextWo || !nextInc || !noteWo || !noteInc) return;

  const active = getActiveAnalystsNow();

  if (!active.length) {
    qv.innerHTML = '<span style="font-size:11px;color:var(--muted2);">Nenhum analista ativo neste horário</span>';
    nextWo.textContent = '—';
    nextInc.textContent = '—';
    noteWo.textContent = 'Fora do horário';
    noteInc.textContent = 'Fora do horário';
    return;
  }

  const loadMap = buildLoadMap(todayCalls);

  // Próximo para cada tipo
  const nextForWO = getNextAnalystForType('WO', loadMap);
  const nextForInc = getNextAnalystForType('Incidente', loadMap);

  nextWo.textContent = nextForWO?.name || '—';
  nextInc.textContent = nextForInc?.name || '—';

  // Nota com a contagem atual do próximo
  if (nextForWO) {
    const load = loadMap.get(nextForWO.id) ?? { wo: 0, inc: 0 };
    noteWo.textContent = `${load.wo} WO atendido${load.wo !== 1 ? 's' : ''} hoje`;
  }

  if (nextForInc) {
    const load = loadMap.get(nextForInc.id) ?? { wo: 0, inc: 0 };
    noteInc.textContent = `${load.inc} incidente${load.inc !== 1 ? 's' : ''} atendido${load.inc !== 1 ? 's' : ''} hoje`;
  }

  // Fila visual — mostra ordem para WO (tipo mais comum) com contagem de ambos
  const queueWO = buildQueueForType('WO', loadMap);

  qv.innerHTML = queueWO.map((analyst, index) => {
    const load = loadMap.get(analyst.id) ?? { wo: 0, inc: 0 };
    const cls = getAnalystBadgeClass(analyst.name);
    const isNext = index === 0;
    return `
      <div
        class="q-chip ${cls} ${isNext ? 'next' : ''}"
        title="WO: ${load.wo} · Inc: ${load.inc}"
      >
        ${escapeHtml(analyst.name)} <span style="opacity:.65;font-size:10px;">${load.wo}W/${load.inc}I</span>
      </div>
    `;
  }).join('');
}

function renderAnalystCards(todayCalls) {
  const grid = document.getElementById('analyst-grid');
  if (!grid) return;

  const analysts = state.config?.analysts || [];
  const loads = computeTodayLoads(todayCalls, analysts);
  const active = getActiveAnalystsNow();

  if (!analysts.length) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = analysts.map((a, index) => {
    const initial = (a.initials || a.name.substring(0, 2)).toUpperCase();
    const stats = loads.get(a.name) || { total: 0, wo: 0, inc: 0 };
    const idSafe = a.id.replace(/[^a-zA-Z0-9_-]/g, '');
    const themeClass = getAnalystThemeClassByIndex(index);

    const activeEntry = active.find(item => item.id === a.id);

    let status = 'Sem turno ativo agora';
    let activeClass = '';

    if (activeEntry) {
      status = `Ativo · ${minutesToHHMM(activeEntry.startMinute)} às ${minutesToHHMM(activeEntry.endMinute)}`;
      if (themeClass === 'af') activeClass = 'active-f';
      else if (themeClass === 'ag') activeClass = 'active-g';
      else activeClass = 'active-x';
    }

    return `
      <div class="analyst-card ${themeClass} ${activeClass}" data-analyst-id="${idSafe}">
        <div class="avatar">${escapeHtml(initial)}</div>
        <div class="aname">${escapeHtml(a.name)}</div>
        <div class="astatus">${escapeHtml(status)}</div>
        <div class="stat-row">
          <div class="stat-box sb-wo">
            <div class="num">${stats.wo}</div>
            <div class="lbl">WO</div>
          </div>
          <div class="stat-box sb-inc">
            <div class="num">${stats.inc}</div>
            <div class="lbl">Inc.</div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderHistory(todayCalls) {
  const histCount = document.getElementById('hist-count');
  const list = document.getElementById('hist-list');

  if (histCount) histCount.textContent = String(todayCalls.length);
  if (!list) return;

  if (!todayCalls.length) {
    list.innerHTML = '<div class="empty">Nenhum chamado registrado hoje</div>';
    return;
  }

  list.innerHTML = [...todayCalls].reverse().map(c => {
    const badgeClass = getAnalystBadgeClass(c.analyst);

    return `
      <div class="hist-item">
        <span class="hist-pill ${getTypeClass(c.type)}">${getTypeLabel(c.type)}</span>
        <span class="hist-who">${getTypeLabel(c.type)}</span>
        <span class="hist-analyst ${badgeClass}">${escapeHtml(c.analyst)}</span>
        <span class="hist-time">${escapeHtml(c.time)}</span>
        <button class="hist-delete-btn" onclick="deleteCall(${c.id})" title="Apagar chamado">🗑️</button>
      </div>
    `;
  }).join('');
}

function updateButtons() {
  const btnWo = document.getElementById('btn-wo');
  const btnInc = document.getElementById('btn-inc');
  const off = getActiveAnalystsNow().length === 0;

  if (btnWo) btnWo.disabled = off;
  if (btnInc) btnInc.disabled = off;
}

function updateUI() {
  const clock = document.getElementById('clock');
  if (clock) clock.textContent = nowClockStr();

  const today = todayStr();
  const todayCalls = (state.calls || []).filter(c => c.date === today);

  renderScheduleDynamic();
  updateZoneBadge();
  renderQueueArea(todayCalls);   // agora recebe todayCalls para calcular loadMap
  renderDebtArea(todayCalls);
  renderAnalystCards(todayCalls);
  renderHistory(todayCalls);
  updateButtons();
}

// ------------------------------------------------------------
// API
// ------------------------------------------------------------

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    data = null;
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status}`);
  }

  return data;
}

async function loadState() {
  try {
    const data = await fetchJson(`${SUPABASE_FUNCTIONS_BASE}/get-state`, {
      method: 'GET'
    });

    const config = normalizeConfig(data?.config || loadConfigFromLocal() || DEFAULT_CONFIG);

    state = {
      calls: Array.isArray(data?.calls) ? data.calls : [],
      queue_turn: Number(data?.queue_turn) || 0,
      config
    };

    saveConfigToLocal(config);
  } catch (e) {
    console.error('Erro ao carregar estado:', e);

    const localConfig = loadConfigFromLocal() || structuredCloneSafe(DEFAULT_CONFIG);

    state = {
      ...state,
      config: localConfig
    };
  }

  updateUI();
}

async function registerCall(type) {
  try {
    const data = await fetchJson(`${SUPABASE_FUNCTIONS_BASE}/register-call`, {
      method: 'POST',
      body: JSON.stringify({ type })
    });

    console.log('Resposta register-call:', data);
    await loadState();
  } catch (e) {
    console.error('Erro ao registrar chamado:', e);
    alert(e?.message || 'Falha ao registrar chamado. Tente novamente.');
  }
}

async function deleteCall(id) {
  if (!confirm('Deseja apagar este chamado do histórico?')) return;

  try {
    const data = await fetchJson(`${SUPABASE_FUNCTIONS_BASE}/delete-call`, {
      method: 'POST',
      body: JSON.stringify({ id })
    });

    console.log('Resposta delete-call:', data);
    await loadState();
  } catch (e) {
    console.error('Erro ao apagar chamado:', e);
    alert(e?.message || 'Não foi possível apagar este chamado.');
  }
}

async function resetAll() {
  if (!confirm('Limpar histórico de hoje e reiniciar fila?')) return;

  try {
    const data = await fetchJson(`${SUPABASE_FUNCTIONS_BASE}/reset-day`, {
      method: 'POST'
    });

    console.log('Resposta reset-day:', data);

    state.calls = [];
    state.queue_turn = 0;
    updateUI();

    await loadState();
  } catch (e) {
    console.error('Erro ao resetar:', e);
    alert(e?.message || 'Erro ao resetar.');
  }
}

// ------------------------------------------------------------
// Config panel
// ------------------------------------------------------------

function openConfig() {
  const backdrop = document.getElementById('config-backdrop');
  if (!backdrop) return;

  const config = normalizeConfig(state.config || loadConfigFromLocal() || DEFAULT_CONFIG);
  state.config = structuredCloneSafe(config);

  renderConfigUI(state.config);
  backdrop.style.display = 'flex';
}

function closeConfig() {
  const backdrop = document.getElementById('config-backdrop');
  if (!backdrop) return;
  backdrop.style.display = 'none';
}

function buildAnalystIdFromName(name, fallbackIndex) {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return base || `analyst_${fallbackIndex + 1}`;
}

function renderConfigUI(config) {
  const analystList = document.getElementById('config-analyst-list');
  const shiftList = document.getElementById('config-shift-list');

  if (!analystList || !shiftList) return;

  analystList.innerHTML = (config.analysts || []).map((a, idx) => `
    <div class="config-chip" data-index="${idx}">
      <div class="config-chip-id">${escapeHtml(a.id)}</div>
      <input
        type="text"
        value="${escapeHtml(a.name)}"
        data-field="name"
        placeholder="Nome do analista"
      />
      <button class="config-small-btn" type="button" onclick="removeAnalyst(${idx})">×</button>
    </div>
  `).join('');

  shiftList.innerHTML = (config.shifts || []).map((shift, idx) => `
    <div class="shift-config-row" data-index="${idx}">
      <select data-field="analystId">
        <option value="">Selecione</option>
        ${(config.analysts || []).map(a => `
          <option value="${escapeHtml(a.id)}"${shift.analystId === a.id ? ' selected' : ''}>${escapeHtml(a.name)}</option>
        `).join('')}
      </select>
      <input type="text" value="${minutesToHHMM(shift.startMinute)}" data-field="start" placeholder="07:00" />
      <input type="text" value="${minutesToHHMM(shift.endMinute)}" data-field="end" placeholder="16:00" />
      <button class="config-small-btn" type="button" onclick="removeShift(${idx})">×</button>
    </div>
  `).join('');
}

function addAnalyst() {
  const cfg = normalizeConfig(state.config || DEFAULT_CONFIG);
  const index = cfg.analysts.length;

  cfg.analysts.push({
    id: `analyst_${index + 1}`,
    name: `Novo analista ${index + 1}`,
    initials: `A${index + 1}`
  });

  state.config = cfg;
  renderConfigUI(cfg);
}

function removeAnalyst(idx) {
  const cfg = normalizeConfig(state.config || DEFAULT_CONFIG);
  const analysts = [...cfg.analysts];

  if (idx < 0 || idx >= analysts.length) return;

  const removed = analysts[idx];
  analysts.splice(idx, 1);

  const shifts = (cfg.shifts || []).filter(shift => shift.analystId !== removed.id);

  state.config = { analysts, shifts };
  renderConfigUI(state.config);
}

function addShift() {
  const cfg = normalizeConfig(state.config || DEFAULT_CONFIG);
  const shifts = [...cfg.shifts];
  const firstAnalystId = cfg.analysts[0]?.id || '';

  shifts.push({
    analystId: firstAnalystId,
    startMinute: 420,
    endMinute: 480
  });

  state.config = {
    ...cfg,
    shifts
  };

  renderConfigUI(state.config);
}

function removeShift(idx) {
  const cfg = normalizeConfig(state.config || DEFAULT_CONFIG);
  const shifts = [...cfg.shifts];

  if (idx < 0 || idx >= shifts.length) return;

  shifts.splice(idx, 1);

  state.config = {
    ...cfg,
    shifts
  };

  renderConfigUI(state.config);
}

function readConfigFromUI() {
  const analystList = document.getElementById('config-analyst-list');
  const shiftList = document.getElementById('config-shift-list');

  if (!analystList || !shiftList) {
    return structuredCloneSafe(DEFAULT_CONFIG);
  }

  const analysts = Array.from(analystList.querySelectorAll('.config-chip')).map((chip, index) => {
    const idText = chip.querySelector('.config-chip-id')?.textContent?.trim() || '';
    const nameInput = chip.querySelector('input[data-field="name"]');
    const name = String(nameInput?.value || '').trim() || `Analista ${index + 1}`;
    const id = idText || buildAnalystIdFromName(name, index);
    const initials = name.slice(0, 2).toUpperCase();

    return { id, name, initials };
  });

  const shifts = Array.from(shiftList.querySelectorAll('.shift-config-row')).map((row) => {
    const analystId = row.querySelector('select[data-field="analystId"]')?.value || '';
    const startStr = row.querySelector('input[data-field="start"]')?.value || '';
    const endStr = row.querySelector('input[data-field="end"]')?.value || '';

    return {
      analystId,
      startMinute: hhmmToMinutes(startStr),
      endMinute: hhmmToMinutes(endStr)
    };
  });

  return {
    analysts,
    shifts
  };
}

function validateConfigForSave(config) {
  const analysts = Array.isArray(config?.analysts) ? config.analysts : [];
  const shifts = Array.isArray(config?.shifts) ? config.shifts : [];

  if (!analysts.length) {
    throw new Error('Adicione pelo menos um analista.');
  }

  const idSet = new Set();
  const nameSet = new Set();

  for (let i = 0; i < analysts.length; i++) {
    const analyst = analysts[i];

    if (!analyst.id || !String(analyst.id).trim()) {
      throw new Error(`Analista ${i + 1} está sem ID.`);
    }

    if (!analyst.name || !String(analyst.name).trim()) {
      throw new Error(`Analista ${i + 1} está sem nome.`);
    }

    const idKey = String(analyst.id).trim();
    const nameKey = String(analyst.name).trim().toLowerCase();

    if (idSet.has(idKey)) throw new Error(`ID duplicado: ${idKey}`);
    if (nameSet.has(nameKey)) throw new Error(`Nome duplicado: ${analyst.name}`);

    idSet.add(idKey);
    nameSet.add(nameKey);
  }

  const sortedShifts = [...shifts]
    .map((item) => ({
      analystId: String(item.analystId || '').trim(),
      startMinute: Number(item.startMinute),
      endMinute: Number(item.endMinute)
    }))
    .sort((a, b) => a.startMinute - b.startMinute || a.analystId.localeCompare(b.analystId));

  for (let i = 0; i < sortedShifts.length; i++) {
    const item = sortedShifts[i];

    if (!item.analystId) {
      throw new Error(`Selecione o analista do turno ${i + 1}.`);
    }

    if (!idSet.has(item.analystId)) {
      throw new Error(`O turno ${i + 1} referencia um analista inválido.`);
    }

    if (!Number.isInteger(item.startMinute) || !Number.isInteger(item.endMinute)) {
      throw new Error('Preencha todos os horários no formato HH:MM.');
    }

    if (item.startMinute < 0 || item.endMinute > 24 * 60) {
      throw new Error('Os horários precisam estar entre 00:00 e 24:00.');
    }

    if (item.startMinute >= item.endMinute) {
      throw new Error(
        `O turno ${i + 1} está inválido (${minutesToHHMM(item.startMinute)}–${minutesToHHMM(item.endMinute)}).`
      );
    }
  }

  return {
    analysts: analysts.map((a) => ({
      id: String(a.id).trim(),
      name: String(a.name).trim(),
      initials: String(a.initials || a.name.slice(0, 2)).trim().toUpperCase()
    })),
    shifts: sortedShifts
  };
}

async function saveConfigFromUI() {
  const backup = structuredCloneSafe(state.config || DEFAULT_CONFIG);

  try {
    const rawConfig = readConfigFromUI();
    const payload = validateConfigForSave(rawConfig);

    const data = await fetchJson(`${SUPABASE_FUNCTIONS_BASE}/set-config`, {
      method: 'POST',
      body: JSON.stringify({ config: payload })
    });

    console.log('Resposta set-config:', data);

    state.config = normalizeConfig(payload);
    saveConfigToLocal(state.config);
    closeConfig();
    updateUI();
    await loadState();
  } catch (e) {
    console.error('Erro ao salvar configuração:', e);
    state.config = backup;
    alert(e?.message || 'Não foi possível salvar a configuração.');
  }
}

function bindConfigCloseEvents() {
  const backdrop = document.getElementById('config-backdrop');
  if (!backdrop) return;

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeConfig();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const isOpen = backdrop.style.display === 'flex';
      if (isOpen) closeConfig();
    }
  });
}

// ------------------------------------------------------------
// Exports globais
// ------------------------------------------------------------

window.registerCall = registerCall;
window.resetAll = resetAll;
window.deleteCall = deleteCall;
window.openConfig = openConfig;
window.closeConfig = closeConfig;
window.addAnalyst = addAnalyst;
window.removeAnalyst = removeAnalyst;
window.addShift = addShift;
window.removeShift = removeShift;
window.saveConfigFromUI = saveConfigFromUI;

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------

initThemeToggle();
bindConfigCloseEvents();

setInterval(() => {
  updateUI();
}, 1000);

setInterval(async () => {
  await loadState();
}, 5000);

loadState();