'use strict';
// UI: connection, polling loop, and one view per feature tab.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const now = () => performance.now() / 1000;
const store = {
  get(k, d) { try { const v = localStorage.getItem('obdpoc.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('obdpoc.' + k, JSON.stringify(v)); } catch {} },
};

const TABS = [['dash', 'Dashboard'], ['trips', 'Trips'], ['service', 'Service'], ['owner', 'Ownership'], ['sensors', 'All sensors'], ['chart', 'Chart'], ['dtc', 'Trouble codes'], ['ff', 'Freeze frame'],
  ['ready', 'Readiness'], ['m06', 'Mode 06'], ['info', 'Vehicle info'], ['accel', 'Acceleration'], ['trip', 'Trip computer'],
  ['custom', 'Custom PIDs'], ['console', 'Terminal']];
const ACCEL_TARGETS = [['0–60 km/h', 60], ['0–60 mph', 96.56], ['0–100 km/h', 100]];
const COLORS = ['#3fb6ff', '#ffb020', '#3ccf7a', '#ff5a8a'];

const newTrip = () => ({ dist: 0, fuel: 0, time: 0, moving: 0, max: 0, last: null, startedAt: null, samples: [], path: [] });

const S = {
  elm: null, connected: false, supported: null, dead: new Set(), values: {}, history: {}, tab: 'dash', dirty: false,
  gauges: store.get('gauges', ['0C', '0D', '05', '04', '11', '42']),
  chartKeys: store.get('chart', ['0C', '0D']),
  custom: store.get('custom', [{ id: 'trans', name: 'Transmission temp (sim demo)', header: '', cmd: '221310', formula: 'A-40', unit: '°C', min: -40, max: 150 }]),
  rec: null, logAll: false, term: [],
  accel: { state: 'ready', results: {}, history: store.get('accelHistory', []) },
  trip: newTrip(),
  hud: false, cache: {},
};

// ---------- metadata and formatting ----------
function meta(k) {
  if (k.startsWith('c:')) {
    const c = S.custom.find(c => 'c:' + c.id === k);
    return c ? { name: c.name, unit: c.unit, min: +c.min || 0, max: +c.max || 100, dp: 1 } : { name: k, unit: '', min: 0, max: 100, dp: 1 };
  }
  return PIDS[k] || { name: k, unit: '', min: 0, max: 100, dp: 1 };
}
const isSupported = k => k.startsWith('c:') ? S.custom.some(c => 'c:' + c.id === k) : !S.supported || S.supported.has(parseInt(k, 16));
const availableKeys = () => PID_KEYS.filter(isSupported).concat(S.custom.map(c => 'c:' + c.id));
const fmt = (k, v) => v == null ? '—' : v.toFixed(meta(k).dp);
const val = k => S.values[k] && now() - S.values[k].t < 5 ? S.values[k].v : null;
let cssCache = {};
const css = n => cssCache[n] ??= getComputedStyle(document.documentElement).getPropertyValue(n).trim();

// ---------- connection ----------
function setStatus(text, cls = '') { const s = $('#status'); s.textContent = text; s.className = 'status ' + cls; }
function logTraffic(dir, text) { if (S.logAll) termPush(dir + ' ' + text); }
function termPush(line) {
  S.term.push(line);
  if (S.term.length > 600) S.term.splice(0, S.term.length - 600);
  const t = $('#term');
  if (t) { t.textContent = S.term.join('\n'); t.scrollTop = t.scrollHeight; }
}

async function connect() {
  const kind = $('#transport').value;
  const t = kind === 'sim' ? new SimTransport() : kind === 'serial' ? new SerialTransport(+$('#baud').value) : new BleTransport();
  $('#connectBtn').disabled = true;
  setStatus('Connecting…');
  try {
    await t.open();
    const elm = new ELM327(t, logTraffic);
    setStatus('Initializing adapter and detecting protocol…');
    await elm.init();
    S.elm = elm;
    S.supported = await OBD.bitmap(elm, '01', 0x41);
    S.dead.clear();
    S.connected = true;
    S.cache = {};
    setStatus(`Connected · ${elm.protocolName}`, 'ok');
    $('#connectBtn').textContent = 'Disconnect';
    $('#recBtn').disabled = false;
    renderTab();
    pollLoop();
    startGps();
  } catch (e) {
    setStatus('Error: ' + e.message, 'err');
    try { await t.close(); } catch {}
  } finally {
    $('#connectBtn').disabled = false;
  }
}

async function disconnect() {
  S.connected = false;
  finishTrip();
  if (S.rec) toggleRecord();
  try { await S.elm?.t.close(); } catch {}
  S.elm = null;
  setStatus('Disconnected');
  $('#connectBtn').textContent = 'Connect';
  $('#recBtn').disabled = true;
  renderTab();
}

// ---------- live data polling ----------
function wantedKeys() {
  const w = new Set(['0D', '10', '5E', '05', '0F']); // speed, fuel and temperatures feed the trip log
  if (S.tab === 'service') w.add('A6');
  if (S.tab === 'dash' || S.rec) S.gauges.forEach(k => w.add(k));
  if (S.tab === 'chart' || S.rec) S.chartKeys.forEach(k => w.add(k));
  if (S.tab === 'sensors') PID_KEYS.forEach(k => w.add(k));
  if (S.tab === 'custom') S.custom.forEach(c => w.add('c:' + c.id));
  if (S.hud) ['0C', '05'].forEach(k => w.add(k));
  return [...w].filter(k => isSupported(k) && !S.dead.has(k));
}

async function readKey(k) {
  if (!k.startsWith('c:')) return OBD.value(S.elm, k);
  const c = S.custom.find(c => 'c:' + c.id === k);
  return c ? OBD.custom(S.elm, c) : null;
}

async function pollLoop() {
  const fails = {};
  while (S.connected) {
    const row = {};
    for (const k of wantedKeys()) {
      if (!S.connected) return;
      try {
        const v = await readKey(k);
        if (v == null) { if ((fails[k] = (fails[k] || 0) + 1) >= 5) S.dead.add(k); continue; }
        fails[k] = 0;
        setValue(k, v);
        row[k] = v;
      } catch (e) {
        if (!S.connected) return;
        console.warn(k, e);
        await sleep(200);
      }
    }
    if (S.rec && Object.keys(row).length) S.rec.push({ time: new Date().toISOString(), ...row });
    await sleep(20);
  }
}

function setValue(k, v) {
  const t = now();
  S.values[k] = { v, t };
  const h = S.history[k] ??= [];
  h.push([t, v]);
  while (h.length && h[0][0] < t - 120) h.shift();
  if (k === '0D') { accelUpdate(v, t); tripUpdate(v, t); }
  if (k === 'A6') setOdometer(v, 'car');
  S.dirty = true;
}

function fuelRateLh() {
  if (val('5E') != null) return val('5E');
  if (val('10') != null) return val('10') * 3600 / (14.7 * 740); // gasoline: stoichiometric AFR 14.7, 740 g/L
  return null;
}

function tripUpdate(speed, t) {
  const T = S.trip;
  if (T.last != null && t - T.last < 5) {
    const dt = t - T.last;
    T.time += dt;
    T.dist += speed * dt / 3600;
    if (speed > 0) T.moving += dt;
    const r = fuelRateLh();
    if (r != null) T.fuel += r * dt / 3600;
  }
  T.last = t;
  T.max = Math.max(T.max, speed);
  T.startedAt ??= Date.now();
  const last = T.samples[T.samples.length - 1];
  if (!last || T.time - last[0] >= 1) T.samples.push([T.time, speed, val('05'), val('0F'), fuelRateLh()]);
}

function accelUpdate(speed, t) {
  const A = S.accel;
  if (A.state === 'running') {
    if (speed <= 0) { A.state = 'ready'; }
    else {
      for (const [label, target] of ACCEL_TARGETS) {
        if (A.results[label] == null && speed >= target) {
          const tc = A.prevS < target && speed > A.prevS ? A.prevT + (target - A.prevS) / (speed - A.prevS) * (t - A.prevT) : t;
          A.results[label] = tc - A.t0;
        }
      }
      if (ACCEL_TARGETS.every(([l]) => A.results[l] != null)) {
        A.state = 'done';
        A.history.unshift({ when: new Date().toLocaleString(), ...A.results });
        A.history = A.history.slice(0, 10);
        store.set('accelHistory', A.history);
      }
    }
  } else if (A.state === 'ready' && speed > 0 && A.prevS === 0) {
    A.state = 'running';
    A.t0 = A.prevT; // the last moment the car was standing still
    A.results = {};
  } else if (A.state === 'done' && speed === 0) {
    A.state = 'ready';
  }
  A.prevT = t; A.prevS = speed;
}

// ---------- drawing ----------
function fitCanvas(cv) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return [ctx, W, H];
}

function drawGauge(cv, k) {
  const m = meta(k), v = val(k);
  const [ctx, W, H] = fitCanvas(cv);
  const cx = W / 2, cy = H * 0.56, r = Math.min(W / 2, H * 0.62) - 12;
  const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
  const frac = v == null ? 0 : Math.max(0, Math.min(1, (v - m.min) / (m.max - m.min)));
  ctx.lineCap = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = css('--track');
  ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1); ctx.stroke();
  if (v != null) {
    ctx.strokeStyle = frac > 0.85 ? css('--warn') : css('--accent');
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a0 + (a1 - a0) * Math.max(frac, 0.001)); ctx.stroke();
  }
  ctx.fillStyle = css('--muted');
  ctx.font = '10px system-ui';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 4; i++) {
    const a = a0 + (a1 - a0) * i / 4, tv = m.min + (m.max - m.min) * i / 4;
    ctx.fillText(Math.abs(tv) >= 1000 ? (tv / 1000) + 'k' : +tv.toFixed(1), cx + Math.cos(a) * (r - 22), cy + Math.sin(a) * (r - 22) + 3);
  }
  ctx.fillStyle = css('--text');
  ctx.font = '700 30px system-ui';
  ctx.fillText(fmt(k, v), cx, cy + 8);
  ctx.fillStyle = css('--muted');
  ctx.font = '12px system-ui';
  ctx.fillText(m.unit, cx, cy + 26);
  ctx.fillText(t(m.name), cx, H - 4);
}

function drawChart(cv) {
  const [ctx, W, H] = fitCanvas(cv);
  const span = 60, tNow = now(), pad = 28;
  ctx.strokeStyle = css('--track'); ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pad + (H - 2 * pad) * i / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.fillStyle = css('--muted'); ctx.font = '11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(t('last 60 s'), 4, H - 6);
  S.chartKeys.forEach((k, i) => {
    const h = (S.history[k] || []).filter(([t]) => t > tNow - span);
    if (h.length < 2) return;
    let lo = Math.min(...h.map(p => p[1])), hi = Math.max(...h.map(p => p[1]));
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    ctx.strokeStyle = COLORS[i % COLORS.length]; ctx.lineWidth = 2;
    ctx.beginPath();
    h.forEach(([t, v], j) => {
      const x = W - (tNow - t) / span * W, y = H - pad - (v - lo) / (hi - lo) * (H - 2 * pad);
      j && t - h[j - 1][0] < 2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); // break the line where polling paused
    });
    ctx.stroke();
    ctx.fillStyle = COLORS[i % COLORS.length]; ctx.textAlign = 'right';
    ctx.fillText(`${t(meta(k).name)}: ${fmt(k, lo)}–${fmt(k, hi)} ${meta(k).unit}`, W - 4, 14 + i * 14);
  });
}

// ---------- live refresh (once per animation frame when values changed) ----------
function updateLive() {
  if (S.tab === 'dash') $$('canvas[data-k]').forEach(cv => drawGauge(cv, cv.dataset.k));
  $$('[data-v]').forEach(el => { el.textContent = fmt(el.dataset.v, val(el.dataset.v)); });
  if (S.tab === 'chart' && $('#chart')) drawChart($('#chart'));
  if (S.tab === 'accel') renderAccelLive();
  if (S.tab === 'trip') renderTripLive();
  if (S.hud) renderHud();
}
function frame() { if (S.dirty) { S.dirty = false; updateLive(); } requestAnimationFrame(frame); }

// ---------- tabs ----------
function renderNav() {
  $('#tabs').innerHTML = TABS.map(([id, label]) => `<button data-tab="${id}" class="${S.tab === id ? 'active' : ''}">${label}</button>`).join('');
}

const options = sel => availableKeys().map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(meta(k).name)}</option>`).join('');
const needConn = () => S.connected ? '' : '<div class="empty">Connect to an adapter, or pick "Simulator" and press Connect.</div>';

function renderTab() {
  renderNav();
  const v = $('#view');
  v.onclick = v.onchange = null;
  const view = VIEWS[S.tab];
  v.innerHTML = view.html();
  view.bind?.(v);
  S.dirty = true;
}

// Wraps a diagnostic action: shows progress, catches errors, renders the result into #out.
async function run(label, fn, render) {
  const out = $('#out');
  if (!S.connected) { out.innerHTML = needConn(); return; }
  out.innerHTML = `<div class="empty">${label}…</div>`;
  try {
    const res = await fn();
    S.cache[S.tab] = res;
    if ($('#out')) $('#out').innerHTML = render(res);
  } catch (e) {
    if ($('#out')) $('#out').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

const pill = (cls, text) => `<span class="pill ${cls}">${text}</span>`;

const VIEWS = {
  dash: {
    html: () => `<div class="toolbar"><button id="addG">+ Add gauge</button><button id="hudBtn">HUD mode</button>
      <span class="muted">Choose a sensor for each gauge. The layout is saved in this browser.</span></div>
      <div class="gauges">${S.gauges.map((k, i) => `<div class="card gauge"><canvas data-k="${k}"></canvas>
      <div class="grow"><select data-i="${i}">${options(k)}</select><button class="x" data-rm="${i}" title="Remove gauge">×</button></div></div>`).join('')}</div>`,
    bind: v => {
      v.onchange = e => { if (e.target.dataset.i) { S.gauges[+e.target.dataset.i] = e.target.value; store.set('gauges', S.gauges); renderTab(); } };
      v.onclick = e => {
        if (e.target.id === 'addG') { S.gauges.push(availableKeys().find(k => !S.gauges.includes(k)) || '0C'); store.set('gauges', S.gauges); renderTab(); }
        if (e.target.dataset.rm) { S.gauges.splice(+e.target.dataset.rm, 1); store.set('gauges', S.gauges); renderTab(); }
        if (e.target.id === 'hudBtn') openHud();
      };
    },
  },

  sensors: {
    html: () => needConn() || `<div class="card"><table><thead><tr><th>Sensor</th><th style="text-align:right">Value</th><th>Unit</th><th>PID</th></tr></thead><tbody>
      ${PID_KEYS.filter(isSupported).map(k => `<tr><td>${esc(PIDS[k].name)}</td><td class="num" data-v="${k}">—</td><td>${PIDS[k].unit}</td><td class="muted code">01 ${k}</td></tr>`).join('')}
      </tbody></table><p class="muted">${S.supported?.size ?? 0} Mode 01 PIDs reported as supported by the ECU.</p></div>`,
  },

  chart: {
    html: () => `<div class="card"><div class="legend">${availableKeys().map(k => {
      const i = S.chartKeys.indexOf(k);
      return `<label><input type="checkbox" value="${k}" ${i >= 0 ? 'checked' : ''}>${i >= 0 ? `<span class="swatch" style="background:${COLORS[i % 4]}"></span>` : ''}${esc(meta(k).name)}</label>`;
    }).join('')}</div><canvas id="chart"></canvas><p class="muted">Up to 4 series. Each line is scaled to its own range.</p></div>`,
    bind: v => {
      v.onchange = e => {
        const k = e.target.value;
        S.chartKeys = e.target.checked ? [...S.chartKeys, k].slice(-4) : S.chartKeys.filter(x => x !== k);
        store.set('chart', S.chartKeys); renderTab();
      };
    },
  },

  dtc: {
    html: () => `<div class="toolbar"><button id="readDtc" class="primary">Read codes</button><button id="clearDtc" class="danger">Clear codes</button>
      <span class="muted">Reads stored (03), pending (07) and permanent (0A) codes from all ECUs that answer.</span></div><div id="out">${S.cache.dtc ? renderDtc(S.cache.dtc) : ''}</div>`,
    bind: v => {
      v.onclick = async e => {
        if (e.target.id === 'readDtc') readDtcs();
        if (e.target.id === 'clearDtc') {
          if (!S.connected) return readDtcs();
          if (!confirm(t('Clear all trouble codes?\n\nThis turns off the check-engine light, erases freeze frame data and resets the emissions readiness monitors. Do it with the engine off and ignition on.'))) return;
          await run('Clearing', () => OBD.clear(S.elm), ok => `<div class="empty">${ok ? 'Codes cleared.' : 'The ECU refused to clear codes.'}</div>`);
          setTimeout(readDtcs, 500);
        }
      };
    },
  },

  ff: {
    html: () => `<div class="toolbar"><button id="readFf" class="primary">Read freeze frame</button><span class="muted">Sensor values the ECU saved when a trouble code was stored (Mode 02).</span></div><div id="out">${S.cache.ff !== undefined ? renderFf(S.cache.ff) : ''}</div>`,
    bind: v => { v.onclick = e => { if (e.target.id === 'readFf') run('Reading freeze frame', () => OBD.freezeFrame(S.elm), renderFf); }; },
  },

  ready: {
    html: () => `<div class="toolbar"><button id="readRd" class="primary">Check readiness</button><span class="muted">Whether the car's self-tests are done, as checked by emissions inspections.</span></div><div id="out">${S.cache.ready !== undefined ? renderReady(S.cache.ready) : ''}</div>`,
    bind: v => { v.onclick = e => { if (e.target.id === 'readRd') run('Reading monitors', () => OBD.readiness(S.elm), renderReady); }; },
  },

  m06: {
    html: () => `<div class="toolbar"><button id="readM6" class="primary">Read test results</button><span class="muted">On-board monitor test results (Mode 06, CAN cars).</span></div><div id="out">${S.cache.m06 ? renderM06(S.cache.m06) : ''}</div>`,
    bind: v => { v.onclick = e => { if (e.target.id === 'readM6') run('Reading Mode 06', () => OBD.mode06(S.elm), renderM06); }; },
  },

  info: {
    html: () => `<div class="toolbar"><button id="readInfo" class="primary">Read vehicle info</button></div><div id="out">${S.cache.info ? renderInfo(S.cache.info) : ''}</div>`,
    bind: v => {
      v.onclick = e => {
        if (e.target.id !== 'readInfo') return;
        run('Reading vehicle info', async () => {
          const e2 = S.elm;
          return {
            VIN: await OBD.info(e2, '02'), 'ECU name': await OBD.info(e2, '0A'), 'Calibration ID': await OBD.info(e2, '04'),
            'Battery voltage (adapter)': await e2.text('ATRV'), Protocol: e2.protocolName, Adapter: e2.version,
            'Supported Mode 01 PIDs': [...S.supported].filter(p => p % 0x20).map(hex2).join(' '),
          };
        }, renderInfo);
      };
    },
  },

  accel: {
    html: () => `<div class="card"><div class="muted" id="accState"></div><div class="big" id="accTimer">0.00 s</div>
      <div class="stats section">${ACCEL_TARGETS.map(([l]) => `<div class="card stat"><div class="l">${l}</div><div class="v" data-acc="${l}">—</div></div>`).join('')}
      <div class="card stat"><div class="l">Speed</div><div class="v"><span data-v="0D">—</span> <small class="muted">km/h</small></div></div></div></div>
      <div class="card section"><b>Previous runs</b><table><thead><tr><th>When</th>${ACCEL_TARGETS.map(([l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody id="accHist"></tbody></table></div>`,
    bind: () => renderAccelLive(),
  },

  trip: {
    html: () => `<div class="toolbar"><button id="tripSave" class="primary">End and save trip</button><button id="tripReset">Reset trip</button><span class="muted">Fuel uses the ECU fuel rate PID when present, otherwise it is estimated from MAF air flow (gasoline).</span></div>
      <div class="stats">${[['dist', 'Distance', 'km'], ['time', 'Duration', ''], ['avgSpd', 'Average speed', 'km/h'], ['max', 'Top speed', 'km/h'],
        ['fuel', 'Fuel used', 'L'], ['avgCons', 'Average consumption', 'L/100km'], ['inst', 'Instant consumption', ''], ['cost', 'Moving time', '']]
        .map(([id, l, u]) => `<div class="card stat"><div class="l">${l}</div><div class="v"><span id="trip_${id}">—</span> <small class="muted" id="tripu_${id}">${u}</small></div></div>`).join('')}</div>`,
    bind: v => {
      v.onclick = e => {
        if (e.target.id === 'tripReset') { S.trip = newTrip(); renderTripLive(); }
        if (e.target.id === 'tripSave') { finishTrip(); S.tab = 'trips'; renderTab(); }
      };
      renderTripLive();
    },
  },

  custom: {
    html: () => `<div class="card"><table><thead><tr><th>Name</th><th>Header</th><th>Command</th><th>Formula</th><th style="text-align:right">Value</th><th></th></tr></thead><tbody>
      ${S.custom.map(c => `<tr><td>${esc(c.name)}</td><td class="code">${esc(c.header || '—')}</td><td class="code">${esc(c.cmd)}</td><td class="code">${esc(c.formula)}</td>
        <td class="num"><span data-v="c:${esc(c.id)}">—</span> ${esc(c.unit)}</td><td><button class="x" data-del="${esc(c.id)}">×</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="card section"><b>Add a custom PID</b><p class="muted">For data the generic OBD-II list does not cover, such as manufacturer PIDs (Mode 21/22).
      The formula uses the response data bytes A, B, C… after the echoed service and PID. Example: <span class="code">(A*256+B)/10</span>.
      Custom PIDs also appear in the dashboard and chart.</p>
      <form id="cform" class="form">
        <label>Name<input name="name" required placeholder="Transmission temp"></label>
        <label>Header (optional)<input name="header" placeholder="7E1" pattern="[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6,8}"></label>
        <label>Command (hex)<input name="cmd" required placeholder="221310" pattern="([0-9A-Fa-f]{2}){2,}"></label>
        <label>Formula<input name="formula" required placeholder="A-40"></label>
        <label>Unit<input name="unit" placeholder="°C"></label>
        <label>Min<input name="min" type="number" value="0"></label>
        <label>Max<input name="max" type="number" value="100"></label>
        <button class="primary">Add</button>
      </form><p id="cerr" class="muted"></p></div>`,
    bind: v => {
      v.onclick = e => {
        if (e.target.dataset.del) { S.custom = S.custom.filter(c => c.id !== e.target.dataset.del); store.set('custom', S.custom); renderTab(); }
      };
      $('#cform').onsubmit = e => {
        e.preventDefault();
        const c = Object.fromEntries(new FormData(e.target));
        try { evalFormula(c.formula, [1, 2, 3, 4]); } catch (err) { $('#cerr').textContent = 'Formula error: ' + err.message; return; }
        c.id = Date.now().toString(36);
        c.cmd = c.cmd.toUpperCase(); c.header = c.header.toUpperCase();
        S.custom.push(c); store.set('custom', S.custom); renderTab();
      };
    },
  },

  console: {
    html: () => `<pre class="term" id="term"></pre><form id="tform" class="toolbar"><input id="tin" placeholder="AT or OBD command, e.g. ATRV, 010C, 0902" style="flex:1" autocomplete="off">
      <button class="primary">Send</button><label class="muted"><input type="checkbox" id="logAll" ${S.logAll ? 'checked' : ''}> Show all traffic (including live data polling)</label></form>`,
    bind: () => {
      termPush('');
      $('#logAll').onchange = e => { S.logAll = e.target.checked; };
      $('#tform').onsubmit = async e => {
        e.preventDefault();
        const cmd = $('#tin').value.trim().toUpperCase();
        if (!cmd) return;
        if (!S.connected) return termPush('! Not connected');
        $('#tin').value = '';
        termPush('> ' + cmd);
        try { termPush(ELM327.textLines(await S.elm.send(cmd, 10000)).join('\n')); } catch (err) { termPush('! ' + err.message); }
      };
    },
  },
};

async function readDtcs() {
  await run('Reading trouble codes', async () => ({
    stored: await OBD.dtcs(S.elm, '03'), pending: await OBD.dtcs(S.elm, '07'),
    permanent: await OBD.dtcs(S.elm, '0A'), ready: await OBD.readiness(S.elm).catch(() => null),
  }), renderDtc);
}

function renderDtc(r) {
  const rows = [['stored', 'Stored', 'bad'], ['pending', 'Pending', 'warn'], ['permanent', 'Permanent', 'off']]
    .flatMap(([key, label, cls]) => r[key].map(code => `<tr><td class="code">${code}</td><td>${pill(cls, label)}</td><td>${esc(describeDTC(code))}</td></tr>`));
  const mil = r.ready ? `<p>Check engine light: ${r.ready.mil ? pill('bad', 'ON') : pill('ok', 'OFF')} · ${r.ready.count} stored code(s) reported by the ECU</p>` : '';
  return `<div class="card">${mil}${rows.length ? `<table><thead><tr><th>Code</th><th>Status</th><th>Description</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<div class="empty">No trouble codes.</div>'}</div>`;
}

function renderFf(ff) {
  if (!ff) return '<div class="card empty">No freeze frame stored.</div>';
  return `<div class="card"><p>Stored by <span class="code">${ff.dtc}</span> — ${esc(describeDTC(ff.dtc))}</p><table><thead><tr><th>Sensor</th><th style="text-align:right">Value</th><th>Unit</th></tr></thead><tbody>
    ${ff.values.map(x => `<tr><td>${esc(x.name)}</td><td class="num">${x.value.toFixed(x.dp)}</td><td>${x.unit}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderReady(r) {
  if (!r) return '<div class="card empty">The ECU did not answer PID 01 01.</div>';
  const supported = r.monitors.filter(m => m.supported), incomplete = supported.filter(m => !m.complete);
  return `<div class="card"><p>Check engine light: ${r.mil ? pill('bad', 'ON') : pill('ok', 'OFF')} · Stored codes: ${r.count} · Engine: ${r.diesel ? 'compression ignition (diesel)' : 'spark ignition (gasoline)'}</p>
    <p>${incomplete.length ? pill('warn', `${incomplete.length} monitor(s) not complete`) : pill('ok', 'All supported monitors complete')}</p>
    <table><thead><tr><th>Monitor</th><th>Status</th></tr></thead><tbody>${r.monitors.map(m => `<tr><td>${m.name}</td><td>${!m.supported ? pill('off', 'Not supported') : m.complete ? pill('ok', 'Complete') : pill('warn', 'Incomplete')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderM06(rows) {
  if (!rows.length) return '<div class="card empty">No Mode 06 results.</div>';
  const n = v => +v.toFixed(3);
  return `<div class="card"><table><thead><tr><th>Monitor</th><th>Test</th><th style="text-align:right">Value</th><th style="text-align:right">Min</th><th style="text-align:right">Max</th><th>Unit</th><th>Result</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="code">${hex2(r.tid)}</td><td class="num">${n(r.value)}</td><td class="num">${n(r.min)}</td><td class="num">${n(r.max)}</td><td>${r.unit}</td><td>${r.pass ? pill('ok', 'Pass') : pill('bad', 'Fail')}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderInfo(info) {
  return `<div class="card"><dl class="info">${Object.entries(info).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v ?? 'not reported')}</dd>`).join('')}</dl></div>`;
}

function renderAccelLive() {
  const A = S.accel, st = $('#accState');
  if (!st) return;
  st.textContent = { ready: 'Ready. Stop the car, then accelerate: timing starts when the car moves.', running: 'Running…', done: 'Run complete. Stop the car to arm the next run.' }[A.state];
  $('#accTimer').textContent = (A.state === 'running' ? now() - A.t0 : A.state === 'done' ? Math.max(...Object.values(A.results)) : 0).toFixed(2) + ' s';
  $$('[data-acc]').forEach(el => { const r = A.results[el.dataset.acc]; el.textContent = r == null ? '—' : r.toFixed(2) + ' s'; });
  $('#accHist').innerHTML = A.history.map(h => `<tr><td>${esc(h.when)}</td>${ACCEL_TARGETS.map(([l]) => `<td>${h[l] != null ? h[l].toFixed(2) + ' s' : '—'}</td>`).join('')}</tr>`).join('') || '<tr><td colspan="4" class="muted">No runs yet.</td></tr>';
}

function hms(s) { s = Math.round(s); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function instantConsumption() {
  const r = fuelRateLh(), spd = val('0D');
  if (r == null) return ['—', ''];
  return spd > 3 ? [(r / spd * 100).toFixed(1), 'L/100km'] : [r.toFixed(2), 'L/h'];
}

function renderTripLive() {
  const T = S.trip;
  if (!$('#trip_dist')) return;
  const [inst, instU] = instantConsumption();
  const set = (id, v) => { $('#trip_' + id).textContent = v; };
  set('dist', T.dist.toFixed(2));
  set('time', hms(T.time));
  set('avgSpd', T.moving ? (T.dist / (T.time / 3600)).toFixed(0) : '—');
  set('max', T.max.toFixed(0));
  set('fuel', T.fuel.toFixed(3));
  set('avgCons', T.dist > 0.05 ? (T.fuel / T.dist * 100).toFixed(1) : '—');
  set('inst', inst); $('#tripu_inst').textContent = instU;
  set('cost', hms(T.moving));
}

// ---------- HUD ----------
function openHud() { S.hud = true; $('#hud').hidden = false; $('#hud').classList.toggle('mirror', store.get('hudMirror', false)); document.documentElement.requestFullscreen?.().catch(() => {}); renderHud(); }
function closeHud() { S.hud = false; $('#hud').hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
function renderHud() {
  const set = (k, t) => { $(`[data-hud="${k}"]`).textContent = t; };
  ['0D', '0C', '05'].forEach(k => set(k, fmt(k, val(k))));
  const [inst, unit] = instantConsumption();
  set('cons', inst); set('consUnit', unit || 'L/100km');
}

// ---------- CSV recording ----------
function toggleRecord() {
  const b = $('#recBtn');
  if (!S.rec) { S.rec = []; b.textContent = '■ Stop & save'; b.classList.add('rec'); return; }
  const rows = S.rec; S.rec = null;
  b.textContent = '● Record CSV'; b.classList.remove('rec');
  if (!rows.length) return;
  const keys = [...new Set(rows.flatMap(r => Object.keys(r).filter(k => k !== 'time')))];
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const csv = [['time', ...keys.map(k => `${meta(k).name} (${meta(k).unit})`)].map(q).join(','),
    ...rows.map(r => [r.time, ...keys.map(k => r[k] ?? '')].join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `obd-log-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- wiring ----------
$('#tabs').onclick = e => { const t = e.target.dataset.tab; if (t) { S.tab = t; renderTab(); } };
$('#connectBtn').onclick = () => S.connected ? disconnect() : connect();
$('#recBtn').onclick = toggleRecord;
$('#transport').onchange = e => { $('#baud').hidden = e.target.value !== 'serial'; };
$('#hudClose').onclick = closeHud;
$('#hudMirror').onclick = () => { const m = !$('#hud').classList.contains('mirror'); $('#hud').classList.toggle('mirror', m); store.set('hudMirror', m); };
$('#baud').hidden = true;
window.addEventListener('resize', () => { S.dirty = true; });
renderTab();
requestAnimationFrame(frame);
