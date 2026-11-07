import { ELM327 } from './elm327';

// OBD-II (SAE J1979) services on top of ELM327: PID decoding, DTCs, freeze frame, readiness, Mode 06, vehicle info.

export const u16 = d => d[0] * 256 + d[1];
export const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const s16 = d => { const v = u16(d); return v >= 0x8000 ? v - 0x10000 : v; };
// Eight O2 sensors in a row (24-2B, 34-3B): the first two bytes are the equivalence ratio (lambda).
const o2Lambda = (first, name) => Object.fromEntries(Array.from({ length: 8 }, (_, i) => [hex2(parseInt(first, 16) + i),
  { name: name.replace('$', String(i + 1)), unit: 'λ', min: 0.5, max: 1.5, dp: 3, bytes: 4, f: d => u16(d) * 2 / 65536 }]));

// Mode 01 PIDs. min/max are the gauge range, not the protocol range.
export const PIDS = {
  '04': { name: 'Engine load', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '05': { name: 'Coolant temperature', unit: '°C', min: -40, max: 130, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '06': { name: 'Short term fuel trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '07': { name: 'Long term fuel trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '08': { name: 'Short term fuel trim B2', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '09': { name: 'Long term fuel trim B2', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '0A': { name: 'Fuel pressure', unit: 'kPa', min: 0, max: 765, dp: 0, bytes: 1, f: d => d[0] * 3 },
  '0B': { name: 'Intake manifold pressure', unit: 'kPa', min: 0, max: 255, dp: 0, bytes: 1, f: d => d[0] },
  '0C': { name: 'Engine RPM', unit: 'rpm', min: 0, max: 8000, dp: 0, bytes: 2, f: d => u16(d) / 4 },
  '0D': { name: 'Vehicle speed', unit: 'km/h', min: 0, max: 240, dp: 0, bytes: 1, f: d => d[0] },
  '0E': { name: 'Timing advance', unit: '°', min: -20, max: 60, dp: 1, bytes: 1, f: d => d[0] / 2 - 64 },
  '0F': { name: 'Intake air temperature', unit: '°C', min: -40, max: 100, dp: 0, bytes: 1, f: d => d[0] - 40 },
  '10': { name: 'MAF air flow', unit: 'g/s', min: 0, max: 200, dp: 1, bytes: 2, f: d => u16(d) / 100 },
  '11': { name: 'Throttle position', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '14': { name: 'O2 sensor B1 S1 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '15': { name: 'O2 sensor B1 S2 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '16': { name: 'O2 sensor B1 S3 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '17': { name: 'O2 sensor B1 S4 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '18': { name: 'O2 sensor B2 S1 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '19': { name: 'O2 sensor B2 S2 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '1A': { name: 'O2 sensor B2 S3 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
  '1B': { name: 'O2 sensor B2 S4 voltage', unit: 'V', min: 0, max: 1.275, dp: 2, bytes: 2, f: d => d[0] / 200 },
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
  '22': { name: 'Fuel rail pressure (relative)', unit: 'kPa', min: 0, max: 5000, dp: 0, bytes: 2, f: d => u16(d) * 0.079 },
  '23': { name: 'Fuel rail pressure', unit: 'kPa', min: 0, max: 200000, dp: 0, bytes: 2, f: d => u16(d) * 10 },
  ...o2Lambda('24', 'O2 sensor $ lambda'),
  '2C': { name: 'Commanded EGR', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '2D': { name: 'EGR error', unit: '%', min: -100, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 128 - 100 },
  '2E': { name: 'Commanded evaporative purge', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '30': { name: 'Warm-ups since codes cleared', unit: '', min: 0, max: 255, dp: 0, bytes: 1, f: d => d[0] },
  '32': { name: 'Evap system vapour pressure', unit: 'Pa', min: -8192, max: 8192, dp: 0, bytes: 2, f: d => s16(d) / 4 },
  ...o2Lambda('34', 'O2 sensor $ lambda (current)'),
  '3C': { name: 'Catalyst temperature B1 S1', unit: '°C', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) / 10 - 40 },
  '3D': { name: 'Catalyst temperature B2 S1', unit: '°C', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) / 10 - 40 },
  '3E': { name: 'Catalyst temperature B1 S2', unit: '°C', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) / 10 - 40 },
  '3F': { name: 'Catalyst temperature B2 S2', unit: '°C', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) / 10 - 40 },
  '47': { name: 'Absolute throttle position B', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '48': { name: 'Absolute throttle position C', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '49': { name: 'Accelerator pedal position D', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '4A': { name: 'Accelerator pedal position E', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '4B': { name: 'Accelerator pedal position F', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '4C': { name: 'Commanded throttle actuator', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '4D': { name: 'Time run with MIL on', unit: 'min', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) },
  '4E': { name: 'Time since codes cleared', unit: 'min', min: 0, max: 10000, dp: 0, bytes: 2, f: d => u16(d) },
  '50': { name: 'Maximum MAF air flow', unit: 'g/s', min: 0, max: 2550, dp: 0, bytes: 1, f: d => d[0] * 10 },
  '52': { name: 'Ethanol fuel', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '53': { name: 'Absolute evap system vapour pressure', unit: 'kPa', min: 0, max: 330, dp: 1, bytes: 2, f: d => u16(d) / 200 },
  '54': { name: 'Evap system vapour pressure (wide)', unit: 'Pa', min: -32768, max: 32767, dp: 0, bytes: 2, f: d => s16(d) },
  '55': { name: 'Short term secondary O2 trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '56': { name: 'Long term secondary O2 trim B1', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '57': { name: 'Short term secondary O2 trim B2', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '58': { name: 'Long term secondary O2 trim B2', unit: '%', min: -25, max: 25, dp: 1, bytes: 1, f: d => (d[0] - 128) * 100 / 128 },
  '59': { name: 'Fuel rail absolute pressure', unit: 'kPa', min: 0, max: 200000, dp: 0, bytes: 2, f: d => u16(d) * 10 },
  '5A': { name: 'Relative accelerator pedal position', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '5B': { name: 'Hybrid battery remaining', unit: '%', min: 0, max: 100, dp: 0, bytes: 1, f: d => d[0] * 100 / 255 },
  '5D': { name: 'Fuel injection timing', unit: '°', min: -210, max: 302, dp: 1, bytes: 2, f: d => u16(d) / 128 - 210 },
  '61': { name: "Driver's demand torque", unit: '%', min: -125, max: 130, dp: 0, bytes: 1, f: d => d[0] - 125 },
  '62': { name: 'Actual engine torque', unit: '%', min: -125, max: 130, dp: 0, bytes: 1, f: d => d[0] - 125 },
  '63': { name: 'Engine reference torque', unit: 'Nm', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) },
  '8E': { name: 'Engine friction torque', unit: '%', min: -125, max: 130, dp: 0, bytes: 1, f: d => d[0] - 125 },
  '9E': { name: 'Exhaust gas flow rate', unit: 'kg/h', min: 0, max: 1000, dp: 0, bytes: 2, f: d => u16(d) / 5 },
  'A2': { name: 'Cylinder fuel rate', unit: 'mg/stroke', min: 0, max: 100, dp: 1, bytes: 2, f: d => u16(d) / 32 },
  'A6': { name: 'Odometer', unit: 'km', min: 0, max: 400000, dp: 0, bytes: 4, f: d => (u16(d) * 65536 + u16(d.slice(2))) / 10 },
};

// Mode 01 PIDs that report a state, not a number: shown as text on the All sensors screen, never as a gauge.
const FUEL_SYSTEM = { 1: 'Open loop (engine cold)', 2: 'Closed loop', 4: 'Open loop (load or deceleration)', 8: 'Open loop (system fault)', 16: 'Closed loop (sensor fault)' };
const OBD_STANDARD = ['', 'OBD-II (California)', 'OBD (EPA)', 'OBD and OBD-II', 'OBD-I', 'Not OBD compliant', 'EOBD (Europe)', 'EOBD and OBD-II',
  'EOBD and OBD', 'EOBD, OBD and OBD-II', 'JOBD (Japan)', 'JOBD and OBD-II', 'JOBD and EOBD', 'JOBD, EOBD and OBD-II'];
const FUEL_TYPE = ['Not available', 'Petrol', 'Methanol', 'Ethanol', 'Diesel', 'LPG', 'CNG', 'Propane', 'Electric', 'Bi-fuel petrol', 'Bi-fuel methanol',
  'Bi-fuel ethanol', 'Bi-fuel LPG', 'Bi-fuel CNG', 'Bi-fuel propane', 'Bi-fuel electric', 'Bi-fuel electric and combustion', 'Hybrid petrol', 'Hybrid ethanol',
  'Hybrid diesel', 'Hybrid electric', 'Hybrid electric and combustion', 'Hybrid regenerative', 'Bi-fuel diesel'];
const AIR_STATUS = { 1: 'Upstream', 2: 'Downstream of catalyst', 4: 'From outside or off', 8: 'Pump on for diagnosis' };
const sensorsPresent = (bits, banks) => { // 13: 2 banks of 4 sensors, 1D: 4 banks of 2
  const per = 8 / banks, out = [];
  for (let b = 0; b < banks; b++) {
    const s = [];
    for (let i = 0; i < per; i++) if (bits & (1 << (b * per + i))) s.push('S' + (i + 1));
    if (s.length) out.push('B' + (b + 1) + ': ' + s.join(' '));
  }
  return out.join(' · ') || '—';
};
// f returns text pieces: the 1st, 3rd… are translated, the 2nd, 4th… (numbers, codes) are added as they are.
export const STATUS_PIDS = {
  '01': { name: 'Check engine light and codes', bytes: 4, f: d => [d[0] & 0x80 ? 'Light on' : 'Light off', ' · ' + (d[0] & 0x7f) + ' ', 'codes'] },
  '03': { name: 'Fuel system status', bytes: 1, f: d => [FUEL_SYSTEM[d[0]] ?? 'Unknown'] },
  '12': { name: 'Secondary air status', bytes: 1, f: d => [AIR_STATUS[d[0]] ?? 'Unknown'] },
  '13': { name: 'O2 sensors present', bytes: 1, f: d => ['', sensorsPresent(d[0], 2)] },
  '1C': { name: 'OBD standard', bytes: 1, f: d => [OBD_STANDARD[d[0]] || 'Unknown'] },
  '1D': { name: 'O2 sensors present', bytes: 1, f: d => ['', sensorsPresent(d[0], 4)] },
  '1E': { name: 'Power take-off', bytes: 1, f: d => [d[0] & 1 ? 'Active' : 'Inactive'] },
  '51': { name: 'Fuel type', bytes: 1, f: d => [FUEL_TYPE[d[0]] ?? 'Unknown'] },
};
// The "supported PIDs" requests themselves (00, 20, 40…) are not sensors.
export const isBitmapPid = n => n % 0x20 === 0;

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

  // A sensor with no number formula: its state as text (STATUS_PIDS), or else its raw bytes in hex.
  async text(elm, pid) {
    const d = await OBD.pid(elm, pid), def = STATUS_PIDS[pid];
    if (!d) return null;
    return def && d.length >= def.bytes ? def.f(d) : ['', d.map(hex2).join(' ')];
  },

  async value(elm, pid) {
    const d = await OBD.pid(elm, pid), def = PIDS[pid];
    return d && def && d.length >= def.bytes ? def.f(d) : null;
  },

  // Reads a "supported" bitmap chain (0100, 0120, ... or 0600, 0620, ...).
  async bitmap(elm, mode, respSid) {
    const set = new Set();
    for (let base = 0; base <= 0xE0; base += 0x20) {
      // Several modules can answer (on a BMW E60, the engine and the gearbox): merge all their bitmaps, or the
      // engine's PIDs (MAF, coolant…) are missed when the gearbox answers first.
      const ms = ELM327.messages(await elm.send(mode + hex2(base))).filter(m => m[0] === respSid && m[1] === base);
      if (!ms.length) break;
      for (const m of ms) for (let i = 0; i < 32; i++) if (m[2 + (i >> 3)] & (0x80 >> (i & 7))) set.add(base + i + 1);
      if (!set.has(base + 0x20)) break;
    }
    return set;
  },

  // Asks every module for its supported Mode 01 PIDs, with headers on so the answers can be told apart, and waits
  // longer than usual so slow modules get to answer. Returns { ecu: Set of PIDs } keyed by the sender's address.
  async ecuBitmaps(elm) {
    const by = {};
    const header = elm.protocolNumber === 7 || elm.protocolNumber === 9 ? 8 : 3; // CAN 29-bit / 11-bit header length
    const parse = l => {
      if (!/^[0-9A-F]+$/.test(l)) return null;
      if (elm.isCAN) {
        if (l.length < header + 4) return null;
        const ecu = l.slice(0, header), b = l.slice(header).match(/../g).map(h => parseInt(h, 16));
        return { ecu, data: b.slice(1, 1 + (b[0] & 0x0f)) }; // single frame: first byte is the length
      }
      if (l.length % 2 || l.length < 10) return null; // K-line / J1850: 3 header bytes, data, checksum
      const b = l.match(/../g).map(h => parseInt(h, 16));
      return { ecu: hex2(b[2]), data: b.slice(3, -1) };
    };
    try {
      for (const c of ['ATH1', 'ATAT0', 'ATSTFF']) await elm.send(c); // ~1 s for each module to answer
      for (let base = 0; base <= 0xE0; base += 0x20) {
        let any = false;
        for (const l of ELM327.lines(await elm.send('01' + hex2(base), 15000))) {
          const r = parse(l);
          if (!r || r.data[0] !== 0x41 || r.data[1] !== base) continue;
          const set = (by[r.ecu] ??= new Set());
          for (let i = 0; i < 32; i++) if (r.data[2 + (i >> 3)] & (0x80 >> (i & 7))) set.add(base + i + 1);
          any = true;
        }
        if (!any || !Object.values(by).some(s => s.has(base + 0x20))) break;
      }
    } finally {
      for (const c of ['ATH0', 'ATST32', 'ATAT1']) await elm.send(c).catch(() => {});
    }
    return by;
  },

  // Picks the module that reports the most of the signals the app's metrics need (normally the engine ECU or the
  // gateway), and on CAN listens only to it. Falls back to every module's list merged.
  async pickEcu(elm, important) {
    let by = {};
    try { by = await OBD.ecuBitmaps(elm); } catch {}
    const score = s => important.filter(k => s.has(parseInt(k, 16))).length;
    const ranked = Object.entries(by).sort(([, a], [, b]) => score(b) - score(a) || b.size - a.size);
    if (!ranked.length) return { ecu: null, supported: await OBD.bitmap(elm, '01', 0x41), ecus: {}, modules: {} };
    const [ecu, supported] = ranked[0];
    if (elm.isCAN && ranked.length > 1) await elm.send('ATCRA' + ecu).catch(() => {});
    // modules: every module that answered and the Mode 01 PIDs it supports, for the module list on All sensors.
    return { ecu, supported, ecus: Object.fromEntries(ranked.map(([e, s]) => [e, score(s)])),
      modules: Object.fromEntries(ranked.map(([e, s]) => [e, [...s].filter(n => !isBitmapPid(n)).sort((a, b) => a - b)])) };
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

// The usual role of a module, from the address it answers from (ISO 15765-4 and SAE J2178 conventions). Only the
// engine and the gearbox have fixed addresses; anything else is just "another module".
export function moduleRole(addr) {
  const a = String(addr).toUpperCase();
  if (a.length === 3) return a === '7E8' ? 'Engine' : a === '7E9' ? 'Gearbox' : 'Other module'; // CAN 11-bit
  const n = parseInt(a.slice(-2), 16); // CAN 29-bit (18DAF1xx) or K-line / J1850 (one byte)
  return n >= 0x10 && n <= 0x17 ? 'Engine' : n >= 0x18 && n <= 0x1f ? 'Gearbox' : 'Other module';
}
