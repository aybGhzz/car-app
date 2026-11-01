// ELM327 command/response layer (ported from the web POC). Transports live in ../transports.

export class ELM327 {
  constructor(transport, log) {
    this.t = transport;
    this.log = log || (() => {});
    this.buf = '';
    this.waiter = null;
    this.queue = Promise.resolve();
    this.isCAN = true;
    this.defaultHeader = '7DF';
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
      try { await Promise.race([done, to]); } finally { clearTimeout(timer); this.waiter = null; }
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
