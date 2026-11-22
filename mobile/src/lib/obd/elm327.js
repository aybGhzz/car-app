// ELM327 command/response layer (ported from the web POC). Transports live in ../transports.

const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const bytes = s => s.match(/../g).map(h => parseInt(h, 16));

// What an ELM327 prints instead of data when a request fails (spaces removed, upper case).
const ERROR_LINE = /^(NODATA|CANERROR|BUSERROR|BUSBUSY|BUFFERFULL|<?DATAERROR|<?RXERROR|FBERROR|LVRESET|STOPPED|UNABLETOCONNECT|ACTALERT|ERR\d+|\?)/;

export class ELM327 {
  constructor(transport, log) {
    this.t = transport;
    this.log = log || (() => {});
    this.buf = '';
    this.waiter = null;
    this.queue = Promise.resolve();
    this.isCAN = true;
    this.defaultHeader = '7DF';
    this.mode = null; // 'live' | 'diag' once set, null while unknown (before the first switch, or after one failed)
    this.filter = null; // the module live mode listens to (CAN only), chosen by OBD.pickEcu
    this.filtered = false; // the adapter's receive filter is on
    transport.onData = d => {
      this.buf += d;
      if (this.waiter && this.buf.includes('>')) this.waiter();
    };
  }

  // Sends one command and resolves with the raw text before the '>' prompt. Commands are serialized.
  send(cmd, timeout = 4000) {
    const run = async () => {
      this.buf = '';
      const done = new Promise(res => { this.waiter = res; });
      this.log('>', cmd);
      await this.t.write(cmd + '\r');
      let timer;
      const to = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timeout waiting for ' + cmd)), timeout); });
      try { await Promise.race([done, to]); }
      catch (e) { this.log('!', e.message + (this.buf ? ' (partial: ' + this.buf.trim() + ')' : '')); throw e; }
      finally { clearTimeout(timer); this.waiter = null; }
      const raw = this.buf.slice(0, this.buf.indexOf('>'));
      this.buf = '';
      this.log('<', raw.trim());
      return raw;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async text(cmd, timeout) {
    return ELM327.textLines(await this.send(cmd, timeout)).filter(l => l.replace(/\s/g, '').toUpperCase() !== cmd).join(' ');
  }

  async init() {
    await this.send('ATZ', 5000).catch(() => {});
    for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) await this.send(c);
    this.version = await this.text('ATI');
    const r = ELM327.messages(await this.send('0100', 20000));
    if (!r.some(m => m[0] === 0x41 && m[1] === 0x00)) throw new Error('Adapter answered but the car did not. Is the ignition on?');
    const pn = parseInt((await this.text('ATDPN')).replace(/^A/i, ''), 16);
    this.protocolNumber = pn;
    this.isCAN = pn >= 6 && pn <= 9;
    this.defaultHeader = pn === 7 || pn === 9 ? '18DB33F1' : '7DF';
    // Some clones answer ATDP with just "AUTO,": name the protocol from its number instead.
    const NAMES = { 1: 'SAE J1850 PWM', 2: 'SAE J1850 VPW', 3: 'ISO 9141-2', 4: 'ISO 14230-4 KWP (5 baud init)', 5: 'ISO 14230-4 KWP (fast init)',
      6: 'ISO 15765-4 CAN (11 bit, 500 kbaud)', 7: 'ISO 15765-4 CAN (29 bit, 500 kbaud)', 8: 'ISO 15765-4 CAN (11 bit, 250 kbaud)', 9: 'ISO 15765-4 CAN (29 bit, 250 kbaud)' };
    this.protocolName = NAMES[pn] ?? (await this.text('ATDP')).replace(/^AUTO,\s*/i, '');
  }

  // Connection modes. The app switches between them on its own (see live.ts), never the user.
  //  live: fast polling of one module. Headers off, adaptive timing, and on CAN the adapter only listens to the
  //        module chosen by OBD.pickEcu, so a second module's answer can't be taken for the engine's.
  //  diag: every module. Receive filter off, headers on (to tell the modules apart) and a fixed ~1 s wait, so slow
  //        modules are not cut off by a timing learned on fast live-data answers.
  async setMode(mode) {
    this.mode = null; // until every command went through: a half-done switch is redone next time
    const at = async (cmd, required) => {
      const r = await this.text(cmd);
      const ok = /OK/i.test(r);
      if (!ok) {
        this.log('!', cmd + ' refused: ' + (r || 'no answer'));
        if (required) throw new Error('The adapter refused ' + cmd + ' (' + (r || 'no answer') + ').');
      }
      return ok;
    };
    if (mode === 'diag') {
      if (!(await at('ATAR')) && this.filtered) {
        throw new Error('The adapter could not stop listening to a single module (ATAR refused), so codes from the other modules would be missed.');
      }
      this.filtered = false;
      await at('ATH1', true);
      await at('ATAT0');
      await at('ATSTFF'); // 255 x 4 ms
    } else {
      await at('ATH0', true);
      await at('ATAT1');
      await at('ATST32'); // the default, 200 ms
      if (this.isCAN && this.filter) this.filtered = await at('ATCRA' + this.filter);
    }
    this.mode = mode;
    this.log('#', 'mode ' + mode + (mode === 'live' && this.filtered ? ' (module ' + this.filter + ')' : ''));
  }

  // Lines that are adapter errors (NO DATA, CAN ERROR, STOPPED, ?...), to tell "no answer" from "no codes".
  static errors(raw) {
    return [...new Set(ELM327.textLines(raw).filter(l => ERROR_LINE.test(l.replace(/\s+/g, '').toUpperCase())))];
  }

  // Parses a response printed with headers on (diag mode) into one record per message: { ecu, data }.
  // ecu is the sender: the CAN ID ('7E8', '18DAF110') or, on K-line / J1850, the source address byte ('10').
  // CAN multi-frame answers are reassembled per sender, so two modules answering at once can't be mixed.
  static records(raw, protocolNumber) {
    const can = protocolNumber >= 6 && protocolNumber <= 9;
    const hl = protocolNumber === 7 || protocolNumber === 9 ? 8 : 3;
    const out = [], open = {};
    for (const l of ELM327.lines(raw)) {
      if (!/^[0-9A-F]+$/.test(l)) continue;
      if (!can) { // 3 header bytes (priority, target, source), data, checksum
        if (l.length % 2 || l.length < 10) continue;
        const b = bytes(l);
        // ISO 14230: when the format byte's length bits are 0, a separate length byte follows the 3 header bytes
        const extra = protocolNumber >= 4 && protocolNumber <= 5 && b[0] >= 0x80 && !(b[0] & 0x3f) ? 1 : 0;
        out.push({ ecu: hex2(b[2]), data: b.slice(3 + extra, -1) });
        continue;
      }
      if (l.length < hl + 2 || (l.length - hl) % 2) continue;
      const ecu = l.slice(0, hl), b = bytes(l.slice(hl)), pci = b[0] >> 4;
      if (pci === 0) out.push({ ecu, data: b.slice(1, 1 + (b[0] & 0x0f)) }); // single frame
      else if (pci === 1) { // first frame: 12-bit length, then the start of the data
        const rec = { ecu, data: b.slice(2), len: ((b[0] & 0x0f) << 8) | b[1] };
        open[ecu] = rec;
        out.push(rec);
      } else if (pci === 2 && open[ecu]) open[ecu].data.push(...b.slice(1)); // consecutive frame
    }
    return out.map(({ ecu, data, len }) => ({ ecu, data: len == null ? data : data.slice(0, len) }));
  }

  static textLines(raw) {
    return raw.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  }
  static lines(raw) {
    return ELM327.textLines(raw).map(l => l.replace(/\s+/g, '').toUpperCase()).filter(l => !/^(SEARCHING|BUSINIT)/.test(l));
  }

  // Parses a response into messages (arrays of bytes). Joins ISO-TP multi-frame answers ("014", "0:..", "1:..").
  static messages(raw) {
    const ls = ELM327.lines(raw);
    const hex = l => l.match(/../g).map(h => parseInt(h, 16));
    const isData = l => /^[0-9A-F]+$/.test(l) && l.length % 2 === 0;
    if (ls.some(l => /^[0-9A-F]:/.test(l))) {
      const out = [];
      let cur = null, len = 0;
      for (const l of ls) {
        if (/^[0-9A-F]{3}$/.test(l)) {
          if (cur) out.push(len ? cur.slice(0, len) : cur);
          cur = []; len = parseInt(l, 16);
        } else if (/^[0-9A-F]:[0-9A-F]*$/.test(l)) {
          (cur ??= []).push(...hex(l.slice(2)));
        } else if (isData(l)) {
          out.push(hex(l));
        }
      }
      if (cur) out.push(len ? cur.slice(0, len) : cur);
      return out;
    }
    return ls.filter(isData).map(hex);
  }
}
