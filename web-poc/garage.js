'use strict';
// Trips log, car ownership papers (insurance, visite technique) and service calendar.
// Loaded after app.js; registers its views in VIEWS. Everything is stored in this browser's localStorage.

const DAY = 86400000;
const fmtDate = ms => new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = ms => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const km = (v, dp = 0) => Number(v).toLocaleString(locale(), { minimumFractionDigits: dp, maximumFractionDigits: dp });
const hm = s => { s = Math.round(s / 60); return s < 60 ? `${s} min` : `${Math.floor(s / 60)} h ${String(s % 60).padStart(2, '0')}`; };

// ---------- GPS (start/end and the route of real trips) ----------
let gpsWatch = null;
function startGps() {
  if (!navigator.geolocation || gpsWatch != null) return;
  gpsWatch = navigator.geolocation.watchPosition(p => {
    const path = S.trip.path, pt = [+p.coords.latitude.toFixed(5), +p.coords.longitude.toFixed(5)];
    const last = path[path.length - 1];
    if (!last || last[0] !== pt[0] || last[1] !== pt[1]) path.push(pt);
  }, () => {}, { enableHighAccuracy: true });
}
function stopGps() { if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; }

// ---------- trip statistics ----------
// samples: [seconds since start, speed km/h, coolant °C, intake air °C, fuel rate L/h]
function tripStats(samples) {
  let dist = 0, fuel = 0, driving = 0, maxSpeed = 0, hardAcc = 0, hardBrake = 0, maxAcc = 0, maxDec = 0, inAcc = false, inBrake = false;
  for (let i = 1; i < samples.length; i++) {
    const [t0, v0] = samples[i - 1], [t1, v1, , , rate] = samples[i], dt = t1 - t0;
    if (dt <= 0 || dt > 10) continue;
    dist += (v0 + v1) / 2 * dt / 3600;
    if (rate != null) fuel += rate * dt / 3600;
    if (v1 > 0) driving += dt;
    maxSpeed = Math.max(maxSpeed, v1);
    const a = (v1 - v0) / 3.6 / dt; // m/s²
    maxAcc = Math.max(maxAcc, a); maxDec = Math.min(maxDec, a);
    if (a > 2 && !inAcc) hardAcc++;
    if (a < -2.5 && !inBrake) hardBrake++;
    inAcc = a > 2; inBrake = a < -2.5;
  }
  const series = i => samples.map(s => s[i]).filter(v => v != null);
  const mma = arr => arr.length ? { min: Math.min(...arr), max: Math.max(...arr), avg: arr.reduce((a, b) => a + b, 0) / arr.length } : null;
  const time = samples.length ? samples[samples.length - 1][0] : 0;
  return {
    dist, fuel, time, driving, standing: time - driving, maxSpeed,
    avgSpeed: driving ? dist / (driving / 3600) : 0, consumption: dist > 0.05 ? fuel / dist * 100 : null,
    coolant: mma(series(2)), iat: mma(series(3)), hardAcc, hardBrake, maxAcc, maxDec: -maxDec,
  };
}

// Placeholder for the backend speed-profile classifier: a random split that sums to 100 %.
function randomSplit(rand = Math.random) {
  const a = 20 + rand() * 50, b = rand() * (100 - a);
  const p = [a, b].map(Math.round);
  return { city: p[0], highway: p[1], road: 100 - p[0] - p[1] };
}

function finishTrip() {
  stopGps();
  const T = S.trip;
  if (T.samples.length > 5 && T.dist > 0.05) {
    const trips = store.get('trips', []);
    trips.unshift({ id: Date.now().toString(36), start: T.startedAt, end: Date.now(), samples: T.samples, path: T.path, split: randomSplit() });
    store.set('trips', trips.slice(0, 200));
    bumpOdometer(T.dist);
  }
  S.trip = newTrip();
}

// ---------- demo trips (deterministic, so the screens are never empty) ----------
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PLACES = {
  maarif: [33.5835, -7.6326, 'Maarif, Casablanca'], ainDiab: [33.5932, -7.6853, 'Ain Diab, Casablanca'],
  sidiMaarouf: [33.5302, -7.6455, 'Sidi Maarouf, Casablanca'], centre: [33.5951, -7.6187, 'Centre-ville, Casablanca'],
  bouskoura: [33.4489, -7.6486, 'Bouskoura'], mohammedia: [33.6866, -7.3830, 'Mohammedia'], rabat: [34.0209, -6.8416, 'Agdal, Rabat'],
};

function demoTrip(seed, dayOffset, startHour, from, to, distKm) {
  const rand = mulberry32(seed), split = randomSplit(rand);
  const legs = [['city', split.city * 0.6], ['road', split.road / 2], ['highway', split.highway], ['road', split.road / 2], ['city', split.city * 0.4]];
  const target = { city: [35, 15], road: [75, 12], highway: [112, 8] };
  const samples = [];
  let t = 0, v = 0, d = 0, stopIn = 0.4 + rand() * 0.4, stopped = 0;
  const dt = 2;
  for (const [kind, pct] of legs) {
    const legEnd = d + distKm * pct / 100;
    while (d < legEnd) {
      const [mean, sd] = target[kind];
      if (kind === 'city' && stopIn <= 0) { // traffic light or junction
        v = Math.max(0, v - (rand() < 0.15 ? 20 : 9)); // sometimes a hard stop
        if (v === 0 && ++stopped > 6 + rand() * 12) { stopped = 0; stopIn = 0.3 + rand() * 0.6; }
      } else {
        const goal = mean + (rand() - 0.5) * 2 * sd;
        if (kind === 'city' && v < 15 && rand() < 0.08) v += 16; // occasional brisk launch from a stop
        else v = Math.max(0, v + Math.max(-6, Math.min(kind === 'city' ? 7 : 5, (goal - v) * 0.25 + (rand() - 0.5) * 3)));
      }
      const step = v * dt / 3600;
      d += step; stopIn -= step; t += dt;
      const coolant = Math.min(89 + rand() * 4, 24 + t / 7);
      const iat = 24 + Math.min(14, t / 120) + rand() * 3 + (v < 5 ? 4 : 0);
      const cons = kind === 'city' ? 10 + rand() * 4 : kind === 'road' ? 6.5 + rand() * 1.5 : 7 + rand() * 1.5;
      samples.push([t, Math.round(v), Math.round(coolant), Math.round(iat), v < 2 ? 0.75 : cons * v / 100]);
    }
  }
  const start = new Date(new Date().setHours(startHour, Math.floor(rand() * 60), 0, 0) - dayOffset * DAY).getTime();
  return { id: 'demo' + seed, demo: true, start, end: start + t * 1000, samples, path: [PLACES[from], PLACES[to]].map(p => p.slice(0, 2)),
    places: [PLACES[from][2], PLACES[to][2]], split };
}

let demoCache = null;
const demoTrips = () => demoCache ??= [
  demoTrip(11, 0, 13, 'maarif', 'ainDiab', 12.6), demoTrip(12, 0, 8, 'sidiMaarouf', 'maarif', 10.2),
  demoTrip(13, 1, 18, 'centre', 'mohammedia', 27.4), demoTrip(14, 2, 9, 'rabat', 'centre', 92.5),
  demoTrip(15, 3, 17, 'bouskoura', 'sidiMaarouf', 14.8), demoTrip(16, 5, 12, 'ainDiab', 'bouskoura', 21.3),
].map(tr => ({ ...tr, stats: tripStats(tr.samples) }));
const allTrips = () => store.get('trips', []).map(tr => ({ ...tr, stats: tripStats(tr.samples) })).concat(demoTrips());
const fuelPrice = () => +store.get('fuelPrice', 14.5);

// ---------- small SVG charts ----------
function lineSvg(points, color, unit) {
  if (points.length < 2) return '<div class="muted">No data</div>';
  const W = 600, H = 120, xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1;
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${((x - x0) / (x1 - x0 || 1) * W).toFixed(1)},${(H - 6 - (y - lo) / span * (H - 12)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="spark"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="spark-axis"><span>max ${km(hi, 1)} ${unit}</span><span>min ${km(lo, 1)} ${unit}</span></div>`;
}

function barsSvg(days) {
  const W = 600, H = 150, max = Math.max(1, ...days.map(d => d.dist)), bw = W / days.length;
  return `<svg viewBox="0 0 ${W} ${H + 40}" class="bars">${days.map((d, i) => {
    const h = d.dist / max * H;
    return `<rect x="${i * bw + bw * 0.18}" y="${H + 18 - h}" width="${bw * 0.64}" height="${h}" rx="4" fill="var(--accent)"/>
      ${d.dist ? `<text x="${i * bw + bw / 2}" y="${H + 12 - h}" text-anchor="middle">${km(d.dist)}</text>` : ''}
      <text x="${i * bw + bw / 2}" y="${H + 36}" text-anchor="middle" class="lbl">${d.label}</text>`;
  }).join('')}</svg>`;
}

// ---------- Trips views ----------
const statTile = (label, value, unit = '') => `<div class="card stat"><div class="l">${label}</div><div class="v">${value} <small class="muted">${unit}</small></div></div>`;

function splitBar(sp) {
  const parts = [['city', 'City', 'var(--warn)'], ['highway', 'Highway', 'var(--accent)'], ['road', 'Road', 'var(--ok)']];
  return `<div class="split"><div class="split-bar">${parts.map(([k, , c]) => `<span style="width:${sp[k]}%;background:${c}"></span>`).join('')}</div>
    <div class="split-legend">${parts.map(([k, l, c]) => `<span><i style="background:${c}"></i>${l} ${sp[k]}%</span>`).join('')}</div></div>`;
}

function tripCard(tr) {
  const s = tr.stats;
  return `<button class="card trip" data-trip="${tr.id}">
    <div class="trip-head"><b>${fmtDate(tr.start)}, ${fmtTime(tr.start)} – ${fmtTime(tr.end)}</b>${tr.demo ? '<span class="pill off">demo</span>' : ''}</div>
    ${tr.places ? `<div class="muted">${esc(tr.places[0])} → ${esc(tr.places[1])}</div>` : ''}
    <div class="trip-grid">
      <div><span class="l">Distance</span><b>${km(s.dist, 2)}</b> km</div>
      <div><span class="l">Avg. speed</span><b>${km(s.avgSpeed, 1)}</b> km/h</div>
      <div><span class="l">Fuel</span><b>${km(s.fuel, 2)}</b> L</div>
      <div><span class="l">Consumption</span><b>${s.consumption == null ? '—' : km(s.consumption, 1)}</b> L/100km</div>
      <div><span class="l">Cost</span><b>${km(s.fuel * fuelPrice(), 2)}</b> MAD</div>
    </div>
    ${splitBar(tr.split)}
  </button>`;
}

function tripsSummary(trips) {
  const since = new Date().setHours(0, 0, 0, 0) - 6 * DAY;
  const week = trips.filter(t => t.start >= since);
  const sum = k => week.reduce((a, t) => a + t.stats[k], 0);
  const dist = sum('dist'), fuel = sum('fuel'), time = sum('time'), driving = sum('driving');
  const days = Array.from({ length: 7 }, (_, i) => {
    const d0 = since + i * DAY;
    return { label: new Date(d0).toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' }), dist: week.filter(t => t.start >= d0 && t.start < d0 + DAY).reduce((a, t) => a + t.stats.dist, 0) };
  });
  return `<h2>Last 7 days</h2><div class="stats">
    ${statTile('Distance', km(dist, 1), 'km')}${statTile('Avg. speed', driving ? km(dist / (driving / 3600), 1) : '—', 'km/h')}
    ${statTile('Fuel', km(fuel, 1), 'L')}${statTile('Consumption', dist ? km(fuel / dist * 100, 2) : '—', 'L/100km')}
    ${statTile('Costs', km(fuel * fuelPrice(), 2), 'MAD')}${statTile('Total time', hm(time))}
    ${statTile('Driving time', hm(driving))}${statTile('Standing time', hm(time - driving))}</div>
    <div class="card section"><b>Distance per day (km)</b>${barsSvg(days)}</div>`;
}

function tripDetail(tr) {
  const s = tr.stats, sp = tr.split, kmOf = p => km(s.dist * p / 100, 1);
  const temp = (label, m) => m ? statTile(label + ' average', km(m.avg), '°C') + statTile(label + ' min', km(m.min), '°C') + statTile(label + ' max', km(m.max), '°C') : '';
  return `<div class="toolbar"><button id="tripBack">← All trips</button><b>${fmtDate(tr.start)}, ${fmtTime(tr.start)} – ${fmtTime(tr.end)}</b>${tr.demo ? '<span class="pill off">demo data</span>' : ''}</div>
    <div class="card"><div id="map" class="map"></div>
      <div class="map-legend"><span><i style="background:var(--ok)"></i>Start${tr.places ? ': ' + esc(tr.places[0]) : ''}</span><span><i style="background:var(--bad)"></i>End${tr.places ? ': ' + esc(tr.places[1]) : ''}</span></div></div>

    <h2>Road type</h2>
    <div class="card">${splitBar(sp)}
      <div class="stats section">${statTile('City', sp.city + '%', kmOf(sp.city) + ' km')}${statTile('Highway', sp.highway + '%', kmOf(sp.highway) + ' km')}${statTile('Road', sp.road + '%', kmOf(sp.road) + ' km')}</div>
      <p class="muted">Placeholder numbers. The speed-profile classifier will compute these in the backend.</p></div>

    <h2>Summary</h2>
    <div class="stats">${statTile('Distance', km(s.dist, 2), 'km')}${statTile('Duration', hm(s.time))}${statTile('Driving time', hm(s.driving))}${statTile('Standing time', hm(s.standing))}
      ${statTile('Fuel used', km(s.fuel, 2), 'L')}${statTile('Consumption', s.consumption == null ? '—' : km(s.consumption, 2), 'L/100km')}${statTile('Cost', km(s.fuel * fuelPrice(), 2), 'MAD')}</div>

    <h2>Speed</h2>
    <div class="stats">${statTile('Average (moving)', km(s.avgSpeed, 1), 'km/h')}${statTile('Maximum', km(s.maxSpeed), 'km/h')}</div>
    <div class="card section">${lineSvg(tr.samples.map(x => [x[0], x[1]]), 'var(--accent)', 'km/h')}</div>

    <h2>Accelerations and decelerations</h2>
    <div class="stats">${statTile('Hard accelerations', s.hardAcc, 'times')}${statTile('Hard braking', s.hardBrake, 'times')}
      ${statTile('Max acceleration', km(s.maxAcc, 2), 'm/s²')}${statTile('Max deceleration', km(s.maxDec, 2), 'm/s²')}</div>
    <p class="muted">Hard acceleration means more than 2 m/s², hard braking more than 2.5 m/s².</p>

    <h2>Engine temperature</h2>
    <div class="stats">${temp('Coolant', s.coolant)}</div>
    <div class="card section">${lineSvg(tr.samples.filter(x => x[2] != null).map(x => [x[0], x[2]]), 'var(--bad)', '°C')}</div>

    <h2>Intake air temperature</h2>
    <div class="stats">${temp('Intake air', s.iat)}</div>
    <div class="card section">${lineSvg(tr.samples.filter(x => x[3] != null).map(x => [x[0], x[3]]), 'var(--warn)', '°C')}</div>

    <h2>Fuel consumption</h2>
    <div class="card">${lineSvg(tr.samples.filter(x => x[4] != null && x[1] > 3).map(x => [x[0], Math.min(30, x[4] / x[1] * 100)]), 'var(--ok)', 'L/100km')}</div>`;
}

function drawTripMap(tr) {
  const el = $('#map');
  if (!el) return;
  const pts = tr.path?.length ? tr.path : null;
  if (!pts) { el.innerHTML = '<div class="empty">No GPS position was recorded for this trip.</div>'; return; }
  if (!window.L) { el.innerHTML = '<div class="empty">Map library not loaded (offline).</div>'; return; }
  const map = L.map(el);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.polyline(pts, { color: '#3fb6ff', weight: 4, dashArray: pts.length === 2 ? '8 8' : null }).addTo(map);
  L.circleMarker(pts[0], { radius: 9, color: '#fff', weight: 2, fillColor: '#3ccf7a', fillOpacity: 1 }).addTo(map).bindTooltip('Start');
  L.circleMarker(pts[pts.length - 1], { radius: 9, color: '#fff', weight: 2, fillColor: '#ff5a5a', fillOpacity: 1 }).addTo(map).bindTooltip('End');
  map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
}

VIEWS.trips = {
  html: () => {
    const trips = allTrips();
    const open = S.tripId && trips.find(t => t.id === S.tripId);
    if (open) return tripDetail(open);
    return `${tripsSummary(trips)}
      <div class="toolbar section"><h2 style="margin:0;flex:1">Trips</h2><label class="muted">Fuel price <input id="fuelPrice" type="number" step="0.01" value="${fuelPrice()}" style="width:90px"> MAD/L</label></div>
      <p class="muted">A trip is saved when you disconnect, or with "End and save trip" on the Trip computer tab. Tap a trip for details.</p>
      <div class="trips">${trips.map(tripCard).join('')}</div>`;
  },
  bind: v => {
    v.onclick = e => {
      const card = e.target.closest('[data-trip]');
      if (card) { S.tripId = card.dataset.trip; renderTab(); scrollTo(0, 0); }
      if (e.target.id === 'tripBack') { S.tripId = null; renderTab(); }
    };
    v.onchange = e => { if (e.target.id === 'fuelPrice') { store.set('fuelPrice', +e.target.value || 0); renderTab(); } };
    const open = S.tripId && allTrips().find(t => t.id === S.tripId);
    if (open) drawTripMap(open);
  },
};

// ---------- Ownership ----------
const OWNER_DEFAULT = {
  plate: '12345-A-6', car: 'Dacia Logan 1.5 dCi', vin: '',
  insCompany: 'Example Assurance', policy: 'POL-2026-004512', insPhone: '+212 522 00 00 00', insStart: '2026-01-16', insExpiry: '2027-01-15',
  vtLast: '2025-11-20', vtNext: '2026-11-20', vtResult: 'Favorable', vtCenter: 'Centre de visite technique, Ain Sebaa',
};
const owner = () => ({ ...OWNER_DEFAULT, ...store.get('owner', {}) });

function dueStatus(date, warnDays = 30) {
  if (!date) return pill('off', 'Not set');
  const days = Math.ceil((new Date(date + 'T23:59:59') - Date.now()) / DAY);
  if (days < 0) return pill('bad', `Expired ${-days} day${days === -1 ? '' : 's'} ago`);
  if (days <= warnDays) return pill('warn', `Due in ${days} day${days === 1 ? '' : 's'}`);
  return pill('ok', `Valid · ${days} days left`);
}
const row = (k, v) => `<dt>${k}</dt><dd>${v || '<span class="muted">not set</span>'}</dd>`;
const fmtD = d => d ? fmtDate(new Date(d + 'T12:00:00')) : '';
const tel = p => esc(p.replace(/\s/g, ''));

VIEWS.owner = {
  html: () => {
    const o = owner();
    const f = (name, label, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${esc(o[name] ?? '')}"></label>`;
    return `<div class="card"><div class="plate">${esc(o.plate)}</div><div class="muted">${esc(o.car)}</div>
        <dl class="info section">${row('VIN', esc(o.vin || S.cache.info?.VIN || ''))}</dl></div>

      <div class="card section"><div class="card-title"><b>Insurance</b>${dueStatus(o.insExpiry, 30)}</div>
        <dl class="info">${row('Company', esc(o.insCompany))}${row('Policy number', `<span class="code">${esc(o.policy)}</span>`)}
        ${row('Valid from', fmtD(o.insStart))}${row('Expiry date', fmtD(o.insExpiry))}
        ${row('Assistance phone', o.insPhone ? `<a href="tel:${tel(o.insPhone)}">${esc(o.insPhone)}</a>` : '')}</dl>
        ${o.insPhone ? `<a class="btn primary section" href="tel:${tel(o.insPhone)}">Call roadside assistance</a>` : ''}</div>

      <div class="card section"><div class="card-title"><b>Visite technique annuelle</b>${dueStatus(o.vtNext, 45)}</div>
        <dl class="info">${row('Last inspection', fmtD(o.vtLast))}${row('Result', o.vtResult ? pill(o.vtResult === 'Favorable' ? 'ok' : o.vtResult === 'Contre-visite' ? 'warn' : 'bad', esc(o.vtResult)) : '')}
        ${row('Next inspection due', fmtD(o.vtNext))}${row('Inspection centre', esc(o.vtCenter))}</dl></div>

      <details class="card section"><summary><b>Edit details</b></summary>
        <form id="ownerForm" class="form section">
          ${f('plate', 'Plate number')}${f('car', 'Make and model')}${f('vin', 'VIN')}
          ${f('insCompany', 'Insurance company')}${f('policy', 'Policy number')}${f('insPhone', 'Assistance phone', 'tel')}
          ${f('insStart', 'Insurance start', 'date')}${f('insExpiry', 'Insurance expiry', 'date')}
          ${f('vtLast', 'Last visite technique', 'date')}${f('vtNext', 'Next visite technique', 'date')}
          <label>Result<select name="vtResult">${['Favorable', 'Contre-visite', 'Défavorable'].map(r => `<option ${r === o.vtResult ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          ${f('vtCenter', 'Inspection centre')}
          <button class="primary">Save</button>
        </form></details>`;
  },
  bind: () => {
    $('#ownerForm').onsubmit = e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target)), o = owner();
      // A new inspection date pre-fills the next one a year later, unless that was changed too.
      if (data.vtLast && data.vtLast !== o.vtLast && data.vtNext === o.vtNext) {
        const d = new Date(data.vtLast); d.setFullYear(d.getFullYear() + 1); data.vtNext = d.toISOString().slice(0, 10);
      }
      store.set('owner', data); renderTab();
    };
  },
};

// ---------- Service calendar ----------
const SERVICE_DEFAULT = [
  { id: 'oil', name: 'Engine oil', interval: 10000, last: 98200, next: 108200 },
  { id: 'oilf', name: 'Oil filter', interval: 10000, last: 98200, next: 108200 },
  { id: 'air', name: 'Air filter', interval: 20000, last: 90000, next: 110000 },
  { id: 'fuelf', name: 'Fuel filter', interval: 40000, last: 80000, next: 120000 },
  { id: 'cabin', name: 'Cabin filter', interval: 15000, last: 92000, next: 107000 },
  { id: 'gear', name: 'Gearbox oil', interval: 60000, last: 45000, next: 105000 },
  { id: 'belt', name: 'Timing belt kit', interval: 60000, last: 40000, next: 100000 },
  { id: 'brake', name: 'Brake fluid', interval: 40000, last: 72000, next: 112000 },
];
const services = () => store.get('services', SERVICE_DEFAULT);
const odometer = () => store.get('odometer', { value: 104760, source: 'manual', at: Date.now() });
function setOdometer(v, source) {
  const o = odometer();
  if (o.source === source && Math.abs(o.value - v) < 0.1) return; // avoid redrawing (and closing open editors) on every poll
  store.set('odometer', { value: v, source, at: Date.now() });
  renderOdo();
}
function bumpOdometer(dist) { const o = odometer(); if (o.source !== 'car') store.set('odometer', { ...o, value: o.value + dist }); }

function renderOdo() {
  const el = $('#odoVal');
  if (!el || S.tab !== 'service') return;
  const o = odometer();
  el.textContent = km(o.value);
  $('#odoSrc').textContent = o.source === 'car' ? `Read from the car (PID A6) at ${fmtTime(o.at)}` : 'Entered manually. It grows with each saved trip.';
  $('#svcGrid').innerHTML = services().map(serviceCard).join('');
}

function serviceCard(s) {
  const odo = odometer().value, span = Math.max(1, s.next - s.last), used = (odo - s.last) / span, left = s.next - odo;
  const cls = left < 0 ? 'bad' : left <= Math.min(1000, span * 0.1) ? 'warn' : 'ok';
  return `<div class="card svc">
    <div class="card-title"><b>${esc(s.name)}</b>${pill(cls, left < 0 ? 'Overdue' : cls === 'warn' ? 'Due soon' : 'OK')}</div>
    <div class="svc-left ${cls}">${left < 0 ? `+${km(-left)} km over` : `−${km(left)} km`}</div>
    <div class="progress"><span class="${cls}" style="width:${Math.max(0, Math.min(100, used * 100)).toFixed(1)}%"></span></div>
    <div class="svc-meta muted"><span>Last: ${km(s.last)} km</span><span>${Math.round(Math.max(0, used) * 100)}% used</span><span>Next: ${km(s.next)} km</span></div>
    <details><summary class="muted">Edit</summary>
      <form class="form section" data-edit="${s.id}">
        <label>Last done at (km)<input name="last" type="number" value="${s.last}"></label>
        <label>Next due at (km)<input name="next" type="number" value="${s.next}"></label>
        <label>Interval (km)<input name="interval" type="number" value="${s.interval}"></label>
        <button class="primary">Save</button><button type="button" data-done="${s.id}">Done now</button><button type="button" class="danger" data-delsvc="${s.id}">Delete</button>
      </form></details></div>`;
}

VIEWS.service = {
  html: () => `<div class="card odo"><div><div class="muted">Odometer</div><div class="big"><span id="odoVal"></span> <small class="muted" style="font-size:20px">km</small></div><div class="muted" id="odoSrc"></div></div>
      <form id="odoForm" class="toolbar"><input name="odo" type="number" placeholder="Set odometer (km)" style="width:170px"><button>Set</button>
      <button type="button" id="odoRead" ${S.connected ? '' : 'disabled'}>Read from car</button></form></div>
    <p class="muted">Each bar fills as the odometer approaches the "next due" mileage. While connected, this tab reads the odometer from the car (cars that support OBD PID A6), so the bars refresh live.</p>
    <div class="svc-grid" id="svcGrid"></div>
    <details class="card section"><summary><b>Add a service item</b></summary>
      <form id="svcAdd" class="form section"><label>Name<input name="name" required placeholder="Spark plugs"></label>
        <label>Last done at (km)<input name="last" type="number" required value="${Math.round(odometer().value)}"></label>
        <label>Interval (km)<input name="interval" type="number" required value="30000"></label><button class="primary">Add</button></form></details>`,
  bind: v => {
    renderOdo();
    const save = list => { store.set('services', list); renderOdo(); };
    v.onsubmit = e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (e.target.id === 'odoForm' && f.odo) setOdometer(+f.odo, 'manual');
      if (e.target.id === 'svcAdd') { save([...services(), { id: Date.now().toString(36), name: f.name, interval: +f.interval, last: +f.last, next: +f.last + +f.interval }]); e.target.reset(); }
      if (e.target.dataset.edit) save(services().map(s => s.id === e.target.dataset.edit ? { ...s, last: +f.last, next: +f.next, interval: +f.interval } : s));
    };
    v.onclick = async e => {
      const d = e.target.dataset;
      if (d.done) { const o = Math.round(odometer().value); save(services().map(s => s.id === d.done ? { ...s, last: o, next: o + s.interval } : s)); }
      if (d.delsvc && confirm(t('Delete this service item?'))) save(services().filter(s => s.id !== d.delsvc));
      if (e.target.id === 'odoRead') {
        const reading = await OBD.value(S.elm, 'A6').catch(() => null);
        if (reading != null) setOdometer(reading, 'car'); else alert(t('This car does not report its odometer over OBD (PID A6). Enter it manually.'));
      }
    };
  },
};

renderTab();
