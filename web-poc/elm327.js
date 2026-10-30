'use strict';
// ELM327 link layer: transports (Web Serial, Web Bluetooth) and the command/response protocol.
// Every transport exposes open(), write(text), close() and calls this.onData(text) for incoming bytes.

class SerialTransport {
  constructor(baud) { this.baud = baud; this.onData = () => {}; }
  async open() {
    if (!('serial' in navigator)) throw new Error('Web Serial is not available. Use desktop Chrome or Edge.');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baud });
    this.writer = this.port.writable.getWriter();
    this.reading = true;
    this._readLoop();
  }
  async _readLoop() {
    const dec = new TextDecoder();
    while (this.reading && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) break;
          this.onData(dec.decode(value));
        }
      } catch (e) {
        console.warn('serial read', e);
      } finally {
        this.reader.releaseLock();
      }
    }
  }
  async write(s) { await this.writer.write(new TextEncoder().encode(s)); }
  async close() {
    this.reading = false;
    try { await this.reader?.cancel(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
  }
}

// Service UUIDs used by common BLE ELM327 clones (FFF0, FFE0, 18F0) and Vgate iCar Pro.
const BLE_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

class BleTransport {
  constructor() { this.onData = () => {}; }
  async open() {
    if (!navigator.bluetooth) throw new Error('Web Bluetooth is not available. Use Chrome on desktop or Android.');
    this.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_SERVICES });
    const server = await this.device.gatt.connect();
    for (const uuid of BLE_SERVICES) {
      let svc;
      try { svc = await server.getPrimaryService(uuid); } catch { continue; }
      const chars = await svc.getCharacteristics();
      const rx = chars.find(c => c.properties.notify || c.properties.indicate);
      const tx = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
      if (rx && tx) { this.rx = rx; this.tx = tx; break; }
    }
    if (!this.tx) throw new Error('No ELM327 serial service found on this Bluetooth device.');
    const dec = new TextDecoder();
    this.rx.addEventListener('characteristicvaluechanged', e => this.onData(dec.decode(e.target.value)));
    await this.rx.startNotifications();
  }
  async write(s) {
    const data = new TextEncoder().encode(s);
    for (let i = 0; i < data.length; i += 20) {
      const chunk = data.slice(i, i + 20);
      if (this.tx.properties.writeWithoutResponse) await this.tx.writeValueWithoutResponse(chunk);
      else await this.tx.writeValue(chunk);
    }
  }
  async close() { try { this.device?.gatt.disconnect(); } catch {} }
}

class ELM327 {
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
    this.protocolName = await this.text('ATDP');
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
