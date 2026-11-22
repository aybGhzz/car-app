import { ELM327 } from './elm327';
import { hex2 } from './obd';

// Module scan: finds every module on the car, not only the ones that answer the generic OBD-II address (those are
// mostly the engine and the gearbox). Each possible module address is asked, one at a time, with the standard
// "tester present" request, which every diagnostic module must answer (KWP2000 ISO 14230-3 and UDS ISO 14229-1,
// service 3E). An answer, even a refusal (7F 3E ..), means a module lives there.
// The sweep follows the protocol the adapter detected:
//   CAN 11 bit (protocols 6, 8): request IDs 700-7F7, any answer on 700-7FF is taken (makers pair IDs differently).
//   CAN 29 bit (protocols 7, 9): 18DAxxF1 for every xx, answers on 18DAF1xx.
//   KWP2000 K-line (protocols 4, 5): every one-byte address with a physical header.
//   ISO 9141-2 and J1850 (1-3): no standard way to address one module, so no sweep.
// Each module found is then asked for its name (UDS 22 F197 / KWP 1A 97, "system name"), with a list of usual
// addresses as a fallback.
// Returns [{ ecu, req, name, self }]: ecu is the address it answers from (as in every other result), req the one to
// ask, self true when the name came from the module itself.

export const canScan = protocolNumber => protocolNumber >= 4 && protocolNumber <= 9;

export async function scanModules(elm, { make, onProgress } = {}) {
  const p = elm.protocolNumber;
  if (!canScan(p)) return [];
  const found = new Map(); // ecu -> req
  const step = (i, n) => onProgress?.({ done: i, total: n, found: found.size });
  await elm.setMode('diag');
  try {
    await elm.send('ATST19'); // 25 x 4 ms = 100 ms: a module answers tester present within 50 ms (P2max)
    if (p === 6 || p === 8) {
      await elm.send('ATCF700');
      await elm.send('ATCM700');
      for (let id = 0x700, i = 0; id <= 0x7F7; id++, i++) {
        const req = id.toString(16).toUpperCase();
        await elm.send('ATSH' + req);
        take(await elm.send('3E00', 3000), req);
        step(i + 1, 0xF8);
      }
    } else if (p === 7 || p === 9) {
      await elm.send('ATCP18');
      await elm.send('ATCF18DAF100');
      await elm.send('ATCM1FFFFF00');
      for (let a = 0; a <= 0xFF; a++) {
        if (a === 0xF1) continue; // the tester's own address
        await elm.send('ATSHDA' + hex2(a) + 'F1');
        take(await elm.send('3E00', 3000), hex2(a));
        step(a + 1, 256);
      }
    } else {
      for (let a = 1; a <= 0xFE; a++) {
        if (a === 0xF1 || a === 0x33) continue; // tester, functional address
        await elm.send('ATSH82' + hex2(a) + 'F1'); // physical, 2 data bytes
        take(await elm.send('3E01', 3000), hex2(a));
        step(a, 0xFE);
      }
    }
    const out = [];
    for (const [ecu, req] of [...found.entries()].sort()) {
      let name = null;
      try { name = await readName(elm, ecu, req); } catch {}
      out.push({ ecu, req, name: name || addressName(ecu, make), self: !!name });
    }
    return out;
  } finally {
    // back to the diag-mode defaults: receive filter off, functional header, ~1 s wait
    if (elm.isCAN) { await elm.send('ATCRA').catch(() => {}); await elm.send('ATAR').catch(() => {}); }
    if (p === 7 || p === 9) { await elm.send('ATCP18').catch(() => {}); await elm.send('ATSHDB33F1').catch(() => {}); }
    else if (elm.isCAN) await elm.send('ATSH7DF').catch(() => {});
    else await elm.send('ATSHC133F1').catch(() => {});
    await elm.send('ATSTFF').catch(() => {});
  }

  function take(raw, req) {
    for (const r of ELM327.records(raw, p)) {
      const d = r.data;
      if (d[0] === 0x7E || (d[0] === 0x7F && d[1] === 0x3E)) { if (!found.has(r.ecu)) found.set(r.ecu, req); }
    }
  }
}

// The module's own name: UDS 22 F197 on CAN, KWP 1A 97 on K-line (the same "system name or engine type" record).
// Readable text only; null when the module does not say.
async function readName(elm, ecu, req) {
  let raw, sid, id;
  if (elm.isCAN) {
    await setCanTarget(elm, ecu, req);
    raw = await elm.send('22F197', 3000); sid = 0x62; id = [0xF1, 0x97];
  } else {
    await elm.send('ATSH82' + req + 'F1');
    raw = await elm.send('1A97', 3000); sid = 0x5A; id = [0x97];
  }
  const r = ELM327.records(raw, elm.protocolNumber).find(x => x.ecu === ecu && x.data[0] === sid && id.every((b, i) => x.data[1 + i] === b));
  if (!r) return null;
  return textName(r.data.slice(1 + id.length));
}

// A name only when the record really is text: many modules (BMW K-line ones, for instance) answer this request with
// binary data, and picking its few printable bytes gave names like "CE" or "2S". So, after dropping the padding
// (00, FF, spaces) at the ends, at least 80% of the bytes must be printable, with 3 characters or more and 2 letters.
export function textName(bytes) {
  let a = 0, b = bytes.length;
  const pad = x => x === 0x00 || x === 0xff || x === 0x20;
  while (a < b && pad(bytes[a])) a++;
  while (b > a && pad(bytes[b - 1])) b--;
  const body = bytes.slice(a, b);
  if (body.length < 3) return null;
  const printable = body.filter(x => x >= 0x20 && x < 0x7f);
  if (printable.length < body.length * 0.8) return null;
  const s = String.fromCharCode(...printable).replace(/\s+/g, ' ').trim();
  return s.length >= 3 && (s.match(/[A-Za-z]/g) || []).length >= 2 ? s : null;
}

// Points the adapter at one CAN module: request header, and the flow control frames of a long answer sent to the
// module's own request ID (the adapter's automatic choice, answer ID - 8, is wrong for makers that pair IDs
// differently).
export async function setCanTarget(elm, ecu, req) {
  if (ecu.length === 8) {
    await elm.send('ATCP18');
    await elm.send('ATSHDA' + ecu.slice(6) + 'F1');
    return;
  }
  const r = req || (parseInt(ecu, 16) - 8).toString(16).toUpperCase();
  await elm.send('ATSH' + r);
  if (parseInt(ecu, 16) - parseInt(r, 16) !== 8) {
    await elm.send('ATFCSH' + r);
    await elm.send('ATFCSD300000');
    await elm.send('ATFCSM1');
  } else await elm.send('ATFCSM0');
}

// Usual module at an address when the module gives no name. Only addresses that are the same across a maker's
// cars are listed; anything else is shown as "Module" with its ID.
const BMW_KLINE = { '00': 'Gateway', '01': 'Airbag', '12': 'Engine', '13': 'Engine', '18': 'Gearbox', '29': 'Stability control', '40': 'Access and immobiliser', '60': 'Instrument cluster', '70': 'Light module', '78': 'Climate control' };
export function addressName(ecu, make) {
  const a = String(ecu).toUpperCase();
  if (a === '7E8') return 'Engine';
  if (a === '7E9') return 'Gearbox';
  if (a.length === 2 && /bmw|mini/i.test(make || '') && BMW_KLINE[a]) return BMW_KLINE[a];
  if (a.length === 2 || a.length === 8) {
    const n = parseInt(a.slice(-2), 16);
    if (n >= 0x10 && n <= 0x17) return 'Engine';
    if (n >= 0x18 && n <= 0x1f) return 'Gearbox';
  }
  return 'Module';
}
