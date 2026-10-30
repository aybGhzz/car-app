import { ELM327 } from './elm327';

// OBD-II (SAE J1979) services on top of ELM327: PID decoding, DTCs, freeze frame, readiness, Mode 06, vehicle info.

export const u16 = d => d[0] * 256 + d[1];
export const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');

// Mode 01 PIDs. min/max are the gauge range, not the protocol range.
export const PIDS = {
  '04': { name: 'Engine load', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '05': { name: 'Coolant temperature', unit: '°C', min: -40, max: 130, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '06': { name: 'Short term fuel trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '07': { name: 'Long term fuel trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '0A': { name: 'Fuel pressure', unit: 'kPa', min: 0, max: 765, dp: 0, bytes: 1, f: d => d[0] * 3 },
  '0B': { name: 'Intake manifold pressure', unit: 'kPa', min: 0, max: 255, dp: 0, bytes: 1, f: d => d[0] },
  '0C': { name: 'Engine RPM', unit: 'rpm', min: 0, max: 8000, dp: 0, bytes: 2, f: d => u16(d) / 4 },
  '0D': { name: 'Vehicle speed', unit: 'km/h', min: 0, max: 240, dp: 0, bytes: 1, f: d => d[0] },
  '0E': { name: 'Timing advance', unit: '°', min: -20, max: 60, dp: 1, bytes: 1, f: d => d[0] / 2 - 64 },
  '0F': { name: 'Intake air temperature', unit: '°C', min: -40, max: 100, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '10': { name: 'MAF air flow', unit: 'g/s', min: 0, max: 200, dp: 1, bytes: 2, f: d => u16(d) / 100 },
  '11': { name: 'Throttle position', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '1F': { name: 'Run time since start', unit: 's', min: 0, max: 3600, dp: 0, bytes: 2, f: d => u16(d) },
  '21': { name: 'Distance with MIL on', unit: 'km', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) },
  '2F': { name: 'Fuel level', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '31': { name: 'Distance since codes cleared', unit: 'km', min: 0, max: 10000, dp: 0, bytes: 2, f: d => u16(d) },
  '33': { name: 'Barometric pressure', unit: 'kPa', min: 0, max: 120, dp: 0, bytes: 1, f: d => d[0] },
  '42': { name: 'Control module voltage', unit: 'V', min: 8, max: 16, dp: 2, bytes: 2, f: d => u16(d) / 1000 },
  '43': { name: 'Absolute load', unit: '%', min: 0, max: 100, dp: 0, bytes: 2, f: d => u16(d) * 100 / 255 },
  '44': { name: 'Commanded lambda', unit: 'λ', min: 0.5, max: 1.5, dp: 3, bytes: 2, f: d => u16(d) * 2 / 65536 },
  '45': { name: 'Relative throttle position', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '46': { name: 'Ambient air temperature', unit: '°C', min: -40, max: 60, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '5C': { name: 'Engine oil temperature', unit: '°C', min: -40, max: 150, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '5E': { name: 'Engine fuel rate', unit: 'L/h', min: 0, max: 40, dp: 1, bytes: 2, f: d => u16(d) / 20 },
  'A6': { name: 'Odometer', unit: 'km', min: 0, max: 400000, dp: 0, bytes: 4, f: d => (u16(d) * 65536 + u16(d.slice(2))) / 10 },
};

// Integer-like keys ('10', '21'…) would otherwise iterate before '04', so keep an explicit hex order.
export const PID_KEYS = Object.keys(PIDS).sort((a, b) => parseInt(a, 16) - parseInt(b, 16));

const MON_CONTINUOUS = ['Misfire', 'Fuel system', 'Components'];
const MON_SPARK = ['Catalyst', 'Heated catalyst', 'Evaporative system', 'Secondary air system', 'A/C refrigerant', 'Oxygen sensor', 'Oxygen sensor heater', 'EGR system'];
const MON_DIESEL = ['NMHC catalyst', 'NOx/SCR aftertreatment', null, 'Boost pressure', null, 'Exhaust gas sensor', 'PM filter', 'EGR/VVT system'];

const MID_NAMES = {
  0x01: 'O2 sensor Bank 1 Sensor 1', 0x02: 'O2 sensor Bank 1 Sensor 2', 0x05: 'O2 sensor Bank 2 Sensor 1', 0x06: 'O2 sensor Bank 2 Sensor 2',
  0x21: 'Catalyst Bank 1', 0x22: 'Catalyst Bank 2', 0x31: 'EGR monitor', 0x39: 'EVAP 0.150" leak', 0x3B: 'EVAP 0.040" leak', 0x3C: 'EVAP 0.020" leak',
  0x41: 'O2 heater Bank 1 Sensor 1', 0x42: 'O2 heater Bank 1 Sensor 2', 0x81: 'Fuel system Bank 1',
  0xA1: 'Misfire general', 0xA2: 'Misfire cylinder 1', 0xA3: 'Misfire cylinder 2', 0xA4: 'Misfire cylinder 3', 0xA5: 'Misfire cylinder 4',
};
// Unit and scaling IDs (subset of SAE J1979 Appendix E).
const UASID = { 0x01: [1, ''], 0x0A: [0.122, 'mV'], 0x0B: [0.001, 'V'], 0x10: [1, 'ms'], 0x24: [1, 'counts'], 0x2F: [0.01, '%'] };

export function decodeDTC(a, b) {
  return 'PCBU'[a >> 6] + ((a >> 4) & 3) + (a & 15).toString(16).toUpperCase() + hex2(b);
}
export function encodeDTC(code) {
  const n = parseInt(code.slice(1), 16);
  return [('PCBU'.indexOf(code[0]) << 6) | (n >> 8), n & 255];
}

export const OBD = {
  async pid(elm, pid) {
    const p = parseInt(pid, 16);
    const m = ELM327.messages(await elm.send('01' + pid)).find(m => m[0] === 0x41 && m[1] === p);
    return m ? m.slice(2) : null;
  },

  async value(elm, pid) {
    const d = await OBD.pid(elm, pid), def = PIDS[pid];
    return d && def && d.length >= def.bytes ? def.f(d) : null;
  },

  // Reads a "supported" bitmap chain (0100, 0120, ... or 0600, 0620, ...).
  async bitmap(elm, mode, respSid) {
    const set = new Set();
    for (let base = 0; base <= 0xE0; base += 0x20) {
      const m = ELM327.messages(await elm.send(mode + hex2(base))).find(m => m[0] === respSid && m[1] === base);
      if (!m) break;
      for (let i = 0; i < 32; i++) if (m[2 + (i >> 3)] & (0x80 >> (i & 7))) set.add(base + i + 1);
      if (!set.has(base + 0x20)) break;
    }
    return set;
  },

  async dtcs(elm, mode) {
    const sid = parseInt(mode, 16) + 0x40, out = [];
    for (const m of ELM327.messages(await elm.send(mode, 8000))) {
      if (m[0] !== sid) continue;
      const d = m.slice(elm.isCAN ? 2 : 1);
      for (let i = 0; i + 1 < d.length; i += 2) if (d[i] || d[i + 1]) out.push(decodeDTC(d[i], d[i + 1]));
    }
    return [...new Set(out)];
  },

  async clear(elm) {
    return ELM327.lines(await elm.send('04', 10000)).some(l => l.startsWith('44'));
  },

  async freezeFrame(elm) {
    const m = ELM327.messages(await elm.send('020200')).find(m => m[0] === 0x42 && m[1] === 0x02);
    if (!m || (!m[3] && !m[4])) return null;
    const values = [];
    for (const pid of PID_KEYS) {
      const p = parseInt(pid, 16);
      const r = ELM327.messages(await elm.send('02' + pid + '00')).find(m => m[0] === 0x42 && m[1] === p);
      const def = PIDS[pid];
      if (r && r.length >= 3 + def.bytes) values.push({ pid, ...def, value: def.f(r.slice(3)) });
    }
    return { dtc: decodeDTC(m[3], m[4]), values };
  },

  async readiness(elm) {
    const d = await OBD.pid(elm, '01');
    if (!d) return null;
    const [A, B, C, D] = d;
    const diesel = !!(B & 8);
    const monitors = MON_CONTINUOUS.map((name, i) => ({ name, supported: !!(B & (1 << i)), complete: !(B & (1 << (i + 4))) }));
    (diesel ? MON_DIESEL : MON_SPARK).forEach((name, i) => {
      if (name) monitors.push({ name, supported: !!(C & (1 << i)), complete: !(D & (1 << i)) });
    });
    return { mil: !!(A & 0x80), count: A & 0x7f, diesel, monitors };
  },

  async info(elm, pid) {
    const p = parseInt(pid, 16);
    const ms = ELM327.messages(await elm.send('09' + pid, 8000)).filter(m => m[0] === 0x49 && m[1] === p);
    if (!ms.length) return null;
    return String.fromCharCode(...ms.flatMap(m => m.slice(3)).filter(b => b >= 0x20 && b < 0x7f)).trim() || null;
  },

  // Mode 06 on CAN: records of MID, TID, UASID, value(2), min(2), max(2).
  async mode06(elm) {
    const mids = [...await OBD.bitmap(elm, '06', 0x46)].filter(m => m % 0x20);
    const rows = [];
    for (const mid of mids) {
      const m = ELM327.messages(await elm.send('06' + hex2(mid))).find(m => m[0] === 0x46 && m[1] === mid);
      if (!m) continue;
      for (let i = 1; i + 9 <= m.length; i += 9) {
        const [scale, unit] = UASID[m[i + 2]] || [1, ''];
        const v = u16(m.slice(i + 3)), lo = u16(m.slice(i + 5)), hi = u16(m.slice(i + 7));
        rows.push({ mid, name: MID_NAMES[mid] || 'MID ' + hex2(mid), tid: m[i + 1], unit,
          value: v * scale, min: lo * scale, max: hi * scale, pass: v >= lo && v <= hi });
      }
    }
    return rows;
  },

};
