const SUPABASE_FUNCTIONS_BASE = 'https://vvgsbosvzwxpftmdbhje.supabase.co/functions/v1';
const SUPABASE_ANON_KEY = 'sb_publishable_rO8Q_hsZ8rdFlvJr7UgYig_7DGfNvzm';
const TIME_ZONE = 'America/Sao_Paulo';

let state = { calls: [], queue_turn: 0 };

function pad(n) {
  return String(n).padStart(2, '0');
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

function nowH() {
  const n = getBrazilNowParts();
  return Number(n.hour) + Number(n.minute) / 60;
}

function zone(h) {
  if (h >= 7 && h < 11) return 'F_only';
  if (h >= 11 && h < 15 + 40 / 60) return 'shared';
  if (h >= 15 + 40 / 60 && h < 20) return 'G_only';
  return 'off';
}

function todayStr() {
  const n = getBrazilNowParts();
  return `${n.year}-${n.month}-${n.day}`;
}

function nowClockStr() {
  const n = getBrazilNowParts();
  return `${n.hour}:${n.minute}:${n.second}`;
}

function globalNext(offset = 0) {
  return ((state.queue_turn + offset) % 2 === 0) ? 'Fernando' : 'Gabriel';
}

async function loadState() {
  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/get-state`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar estado');
    }

    state = {
      calls: data.calls || [],
      queue_turn: data.queue_turn || 0
    };

    console.log('Estado carregado:', state);
  } catch (e) {
    console.error('Erro ao carregar estado:', e);
  }

  updateUI();
}

async function registerCall(type) {
  const z = zone(nowH());

  if (z === 'off') {
    alert('Fora do horário (07:00–20:00)');
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/register-call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ type })
    });

    const data = await res.json();
    console.log('Resposta register-call:', res.status, data);

    if (!res.ok) {
      throw new Error(data.error || 'Falha ao registrar chamado');
    }

    await loadState();
  } catch (e) {
    console.error('Erro ao registrar chamado:', e);
    alert('Falha ao registrar chamado. Tente novamente.');
  }
}

async function resetAll() {
  if (!confirm('Limpar histórico de hoje e reiniciar fila?')) return;

  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/reset-day`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY
      }
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao resetar');
    }

    state.calls = [];
    state.queue_turn = 0;
    updateUI();

    await loadState();
  } catch (e) {
    console.error('Erro ao resetar:', e);
    alert('Erro ao resetar.');
  }
}

function updateUI() {
  const h = nowH();
  const z = zone(h);

  document.getElementById('clock').textContent = nowClockStr();

  const badge = document.getElementById('zone-badge');
  const dot = document.getElementById('live-dot');
  const zt = document.getElementById('zone-text');

  if (z === 'F_only') {
    badge.style.cssText = 'background:#FFF0E8;color:#7A3A1E;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;';
    dot.style.background = '#F4845F';
    zt.textContent = 'Fernando (07:00–11:00)';
  } else if (z === 'G_only') {
    badge.style.cssText = 'background:#E8F4FF;color:#1E3D7A;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;';
    dot.style.background = '#5F9BF4';
    zt.textContent = 'Gabriel (15:40–20:00)';
  } else if (z === 'shared') {
    badge.style.cssText = 'background:#F0EDE8;color:#4A3F35;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;';
    dot.style.background = '#888';
    zt.textContent = 'Divisão por categoria (11:00–15:40)';
  } else {
    badge.style.cssText = 'background:#F0EDE8;color:#9B8E82;border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;';
    dot.style.background = '#9B8E82';
    zt.textContent = 'Fora do horário';
  }

  let nWO, nInc, noteWO, noteInc;

  if (z === 'off') {
    nWO = nInc = '—';
    noteWO = noteInc = 'Fora do horário';
  } else if (z === 'F_only') {
    nWO = nInc = 'Fernando';
    noteWO = noteInc = 'Horário exclusivo';
  } else if (z === 'G_only') {
    nWO = nInc = 'Gabriel';
    noteWO = noteInc = 'Horário exclusivo';
  } else {
    nWO = globalNext(0);
    nInc = globalNext(1);
    noteWO = 'Turno ' + (state.queue_turn + 1) + ' na fila global';
    noteInc = 'Turno ' + (state.queue_turn + 2) + ' na fila global';
  }

  document.getElementById('next-wo').textContent = nWO;
  document.getElementById('next-inc').textContent = nInc;
  document.getElementById('note-wo').textContent = noteWO;
  document.getElementById('note-inc').textContent = noteInc;

  const qv = document.getElementById('queue-visual');

  if (z === 'off' || z === 'F_only' || z === 'G_only') {
    qv.innerHTML = '<span style="font-size:11px;color:#C4B9AE;">Disponível no horário compartilhado</span>';
  } else {
    let html = '';
    for (let i = 0; i < 8; i++) {
      const who = globalNext(i);
      const initial = who[0];
      const isNext = i === 0;
      html += `<div class="q-chip ${initial}${isNext ? ' next' : ''}">${who.substring(0, 3)}</div>`;
      if (i === 1) html += `<span style="font-size:10px;color:#C4B9AE;">···</span>`;
    }
    qv.innerHTML = html;
  }

  const today = todayStr();
  const todayCalls = state.calls.filter(c => c.date === today);

  const fTotal = todayCalls.filter(c => c.analyst === 'Fernando').length;
  const gTotal = todayCalls.filter(c => c.analyst === 'Gabriel').length;
  const diff = fTotal - gTotal;
  const da = document.getElementById('debt-area');

  if (z === 'shared' && diff !== 0) {
    const ahead = diff > 0 ? 'Fernando' : 'Gabriel';
    const n = Math.abs(diff);
    da.innerHTML = `<div class="debt-note">⚖ <span>${ahead}</span> tem ${n} chamado${n > 1 ? 's' : ''} a mais hoje · a fila equilibra automaticamente</div>`;
  } else {
    da.innerHTML = '';
  }

  const cF = document.getElementById('card-f');
  const cG = document.getElementById('card-g');
  cF.className = 'analyst-card af';
  cG.className = 'analyst-card ag';
  document.getElementById('status-f').textContent = '';
  document.getElementById('status-g').textContent = '';

  if (z === 'F_only') {
    cF.classList.add('active-f');
    document.getElementById('status-f').textContent = 'Recebendo todos os chamados';
    document.getElementById('status-g').textContent = 'Aguardando';
  } else if (z === 'G_only') {
    cG.classList.add('active-g');
    document.getElementById('status-g').textContent = 'Recebendo todos os chamados';
    document.getElementById('status-f').textContent = 'Turno encerrado';
  } else if (z === 'shared') {
    document.getElementById('status-f').textContent = 'Turno compartilhado';
    document.getElementById('status-g').textContent = 'Turno compartilhado';
  } else {
    document.getElementById('status-f').textContent = 'Fora do horário';
    document.getElementById('status-g').textContent = 'Fora do horário';
  }

  let fwo = 0, finc = 0, gwo = 0, ginc = 0;

  todayCalls.forEach(c => {
    if (c.analyst === 'Fernando' && c.type === 'WO') fwo++;
    if (c.analyst === 'Fernando' && c.type === 'Incidente') finc++;
    if (c.analyst === 'Gabriel' && c.type === 'WO') gwo++;
    if (c.analyst === 'Gabriel' && c.type === 'Incidente') ginc++;
  });

  document.getElementById('f-wo').textContent = fwo;
  document.getElementById('f-inc').textContent = finc;
  document.getElementById('g-wo').textContent = gwo;
  document.getElementById('g-inc').textContent = ginc;

  const off = z === 'off';
  document.getElementById('btn-wo').disabled = off;
  document.getElementById('btn-inc').disabled = off;

  document.getElementById('hist-count').textContent = todayCalls.length;
  const list = document.getElementById('hist-list');

  if (todayCalls.length === 0) {
    list.innerHTML = '<div class="empty">Nenhum chamado registrado hoje</div>';
  } else {
    list.innerHTML = [...todayCalls].reverse().map((c) => `
      <div class="hist-item">
        <span class="hist-pill ${c.type === 'WO' ? 'wo' : 'inc'}">${c.type}</span>
        <span class="hist-who">${c.type}</span>
        <span class="hist-analyst ${c.analyst[0]}">${c.analyst}</span>
        <span class="hist-time">${c.time}</span>
      </div>
    `).join('');
  }
}

window.registerCall = registerCall;
window.resetAll = resetAll;

setInterval(() => { updateUI(); }, 1000);
setInterval(async () => { await loadState(); }, 5000);
loadState();