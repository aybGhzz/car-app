'use strict';
// A fake ELM327 on a CAN (ISO 15765-4, 11 bit, 500 kbps) car. It answers the same text commands as a real
// adapter, so the whole app (parsers included) runs unchanged without a car.
// Drive cycle repeats every 30 s: idle 5 s, full-throttle acceleration 10 s, cruise 7 s, braking 8 s.

class SimTransport {
  constructor() {
    this.onData = () => {};
    this.start = performance.now();
    this.reset();
    this.stored = ['P0301', 'P0420'];
    this.pending = ['P0171'];
    this.permanent = ['P0420'];
    this.clearedAt = null;
    this.freeze = { ...this.state(0), rpm: 2450, speed: 72, coolant: 88, load: 64, iat: 31, maf: 28.4, throttle: 34, stft: -6.2, ltft: 3.1, map: 68, timing: 18 };
  }
  reset() { this.echo = true; this.spaces = true; this.searching = true; }
  async open() {}
  async close() {}
  async write(s) {
    const cmd = s.replace(/\s/g, '').toUpperCase();
    const resp = this.handle(cmd);
    setTimeout(() => this.onData((this.echo ? cmd + '\r' : '') + resp + '\r\r>'), 6 + Math.random() * 8);
  }

  fmt(bytes) { return bytes.map(hex2).join(this.spaces ? ' ' : ''); }
  // ISO-TP output as an ELM327 prints it with headers off: byte count, then numbered frames.
  frames(bytes) {
    if (bytes.length <= 7) return this.fmt(bytes);
    const out = [bytes.length.toString(16).toUpperCase().padStart(3, '0')];
    out.push('0:' + (this.spaces ? ' ' : '') + this.fmt(bytes.slice(0, 6)));
    for (let i = 6, n = 1; i < bytes.length; i += 7, n++) {
      const chunk = bytes.slice(i, i + 7);
      while (chunk.length < 7) chunk.push(0);
      out.push((n % 16).toString(16).toUpperCase() + ':' + (this.spaces ? ' ' : '') + this.fmt(chunk));
    }
    return out.join('\r');
  }

  state(t = (performance.now() - this.start) / 1000) {
    const ph = t % 30, w = Math.sin(t * 2.3);
    let speed, rpm, throttle;
    if (ph < 5) { speed = 0; rpm = 780 + 15 * w; throttle = 0; }
    else if (ph < 15) {
      const x = (ph - 5) / 10;
      speed = 130 * (1 - (1 - x) ** 2);
      const gears = [[0, 30], [30, 58], [58, 88], [88, 118]];
      const g = gears.find(([, hi]) => speed < hi);
      rpm = g ? 1800 + (speed - g[0]) / (g[1] - g[0]) * 4400 : speed * 24;
      throttle = 92;
    } else if (ph < 22) { speed = 130 + 1.5 * w; rpm = speed * 24; throttle = 24; }
    else { speed = 130 * (1 - (ph - 22) / 8); rpm = Math.max(790, speed * 24); throttle = 0; }
    const load = throttle ? 20 + throttle * 0.8 : 22 + 3 * w;
    const maf = rpm * load / 100 * 0.011;
    return {
      speed, rpm, throttle, load, maf,
      map: 28 + load * 0.75, timing: 8 + rpm / 500 - load / 12,
      coolant: Math.min(91, 22 + t * 1.5), oil: Math.min(98, 20 + t * 1.2), trans: Math.min(85, 20 + t), iat: 27 + 2 * w, ambient: 21,
      stft: 2.3 * w, ltft: 3.1, fuel: Math.max(4, 63 - t * 0.02), baro: 101, voltage: 14.1 + 0.08 * w,
      lambda: throttle > 80 ? 0.87 : 1, fuelRate: maf * 3600 / (14.7 * 740), fuelPress: 380, runtime: t,
      distMil: this.stored?.length ? 134 : 0,
      odometer: 104760 + t * 76.7 / 3600, // the drive cycle averages about 76.7 km/h
      distClear: this.clearedAt == null ? 2318 : (t - this.clearedAt) * speed / 3600,
    };
  }

  encode(pid, s) {
    const w = v => { v = Math.max(0, Math.round(v)); return [(v >> 8) & 255, v & 255]; };
    const b = v => [Math.max(0, Math.min(255, Math.round(v)))];
    const enc = {
      '04': () => b(s.load * 2.55), '05': () => b(s.coolant + 40), '06': () => b(s.stft * 1.28 + 128), '07': () => b(s.ltft * 1.28 + 128),
      '0A': () => b(s.fuelPress / 3), '0B': () => b(s.map), '0C': () => w(s.rpm * 4), '0D': () => b(s.speed), '0E': () => b((s.timing + 64) * 2),
      '0F': () => b(s.iat + 40), '10': () => w(s.maf * 100), '11': () => b(s.throttle * 2.55), '1F': () => w(s.runtime), '21': () => w(s.distMil),
      '2F': () => b(s.fuel * 2.55), '31': () => w(s.distClear), '33': () => b(s.baro), '42': () => w(s.voltage * 1000), '43': () => w(s.load * 2.55),
      '44': () => w(s.lambda * 32768), '45': () => b(s.throttle * 2.55), '46': () => b(s.ambient + 40), '5C': () => b(s.oil + 40), '5E': () => w(s.fuelRate * 20),
      'A6': () => { const v = Math.round(s.odometer * 10); return [...w(Math.floor(v / 65536)), ...w(v % 65536)]; },
    };
    if (pid === '01') {
      const d = this.clearedAt == null ? 0x04 : 0x65; // after a clear, every monitor is incomplete again
      return [(this.stored.length ? 0x80 : 0) | this.stored.length, 0x07, 0x65, d];
    }
    const base = ['00', '20', '40', '60', '80', 'A0'].indexOf(pid);
    if (base >= 0) return this.bitmap(Object.keys(enc).concat('01').map(k => parseInt(k, 16)), base * 0x20);
    return enc[pid]?.();
  }

  bitmap(list, base) {
    const out = [0, 0, 0, 0];
    for (const p of list) {
      const i = p - base - 1;
      if (i >= 0 && i < 32) out[i >> 3] |= 0x80 >> (i & 7);
    }
    if (list.some(p => p > base + 0x20)) out[3] |= 1;
    return out;
  }

  handle(cmd) {
    if (cmd.startsWith('AT')) {
      const c = cmd.slice(2);
      if (c === 'Z') { this.reset(); return '\rELM327 v1.5'; }
      if (c === 'I') return 'ELM327 v1.5';
      if (/^E[01]$/.test(c)) this.echo = c === 'E1';
      if (/^S[01]$/.test(c)) this.spaces = c === 'S1';
      if (c.startsWith('SP')) this.searching = true;
      if (c === 'DPN') return 'A6';
      if (c === 'DP') return 'AUTO, ISO 15765-4 (CAN 11/500)';
      if (c === 'RV') return this.state().voltage.toFixed(1) + 'V';
      return 'OK';
    }
    if (!/^([0-9A-F]{2})+$/.test(cmd)) return '?';
    const prefix = this.searching ? 'SEARCHING...\r' : '';
    this.searching = false;
    const mode = cmd.slice(0, 2), pid = cmd.slice(2, 4), n = parseInt(pid, 16);
    const nodata = prefix + 'NO DATA';
    switch (mode) {
      case '01': {
        const d = this.encode(pid, this.state());
        return d ? prefix + this.fmt([0x41, n, ...d]) : nodata;
      }
      case '02': {
        if (!this.stored.length) return nodata;
        if (pid === '02') return this.fmt([0x42, 0x02, 0x00, ...encodeDTC(this.stored[0])]);
        const d = pid === '01' ? null : this.encode(pid, this.freeze);
        return d && !['00', '20', '40', '60', '80', 'A0', 'A6'].includes(pid) ? this.fmt([0x42, n, 0x00, ...d]) : nodata;
      }
      case '03': case '07': case '0A': {
        const list = { '03': this.stored, '07': this.pending, '0A': this.permanent }[mode];
        return prefix + this.frames([parseInt(mode, 16) + 0x40, list.length, ...list.flatMap(encodeDTC)]);
      }
      case '04':
        this.stored = []; this.pending = [];
        this.clearedAt = (performance.now() - this.start) / 1000;
        return '44';
      case '06': return this.mode06(n) || nodata;
      case '09': {
        const ascii = s => [...s].map(c => c.charCodeAt(0));
        const vals = { '02': ascii('1HGCM82633A004352'), '04': ascii('SIM-CAL-0042'.padEnd(16, '\0')), '0A': ascii('ECM-EngineControl'.padEnd(20, '\0')) };
        if (pid === '00') return this.fmt([0x49, 0x00, 0x54, 0x40, 0x00, 0x00]);
        return vals[pid] ? this.frames([0x49, n, 0x01, ...vals[pid]]) : nodata;
      }
      case '22': // manufacturer PID used by the sample custom PID
        if (cmd === '221310') return this.fmt([0x62, 0x13, 0x10, Math.round(this.state().trans + 40)]);
        return this.fmt([0x7F, 0x22, 0x31]);
      default: return nodata;
    }
  }

  mode06(mid) {
    const tests = {
      0x01: [[0x01, 0x0A, 3690, 0, 3690], [0x05, 0x10, 72, 0, 160]],
      0x02: [[0x01, 0x0A, 6120, 4920, 8200]],
      0x21: [[0x80, 0x01, 812, 0, 610]],
      0xA2: [[0x0B, 0x24, 41, 0, 15]], 0xA3: [[0x0B, 0x24, 0, 0, 15]],
    };
    if (mid === 0x00) return this.fmt([0x46, 0x00, ...this.bitmap(Object.keys(tests).map(Number), 0x00)]);
    if (mid % 0x20 === 0) return this.fmt([0x46, mid, ...this.bitmap(Object.keys(tests).map(Number), mid)]);
    const t = tests[mid];
    if (!t) return null;
    const w = v => [v >> 8, v & 255];
    return this.frames([0x46, ...t.flatMap(([tid, uas, v, lo, hi]) => [mid, tid, uas, ...w(v), ...w(lo), ...w(hi)])]);
  }
}
