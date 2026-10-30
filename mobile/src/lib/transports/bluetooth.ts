// Real ELM327 adapters. Both libraries are native modules, so they work in a development build
// (eas build --profile development), not in Expo Go. They are required lazily so the app still
// starts in Expo Go, where only the simulator is available.
import { PermissionsAndroid, Platform } from 'react-native';
import type { FoundDevice, Transport } from './types';

export class NeedsDevBuild extends Error {
  constructor() {
    super('Bluetooth needs the development build of the app. In Expo Go, use the simulator.');
  }
}

function load<T>(name: 'ble' | 'classic'): T {
  try {
    const mod = name === 'ble' ? require('react-native-ble-plx') : require('react-native-bluetooth-classic').default;
    if (name === 'classic' && !mod) throw new Error();
    return mod as T;
  } catch {
    throw new NeedsDevBuild();
  }
}

async function askPermissions() {
  if (Platform.OS !== 'android') return;
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = Platform.Version >= 31 ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] : [P.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(wanted);
  if (Object.values(res).some(r => r !== 'granted')) throw new Error('Bluetooth permission was refused.');
}

// ---------- classic Bluetooth (SPP), the most common cheap ELM327. Android only: iOS has no SPP. ----------
export async function listClassicDevices(): Promise<FoundDevice[]> {
  if (Platform.OS !== 'android') throw new Error('Classic Bluetooth adapters only work on Android. On iPhone, use a Bluetooth LE or Wi-Fi adapter.');
  const RNBC = load<any>('classic');
  await askPermissions();
  if (!(await RNBC.isBluetoothEnabled())) await RNBC.requestBluetoothEnabled();
  const bonded = await RNBC.getBondedDevices();
  return bonded.map((d: any) => ({ id: d.address, name: d.name || d.address }));
}

export class ClassicTransport implements Transport {
  onData = (_: string) => {};
  private dev: any;
  private sub: any;
  constructor(private address: string) {}
  async open() {
    const RNBC = load<any>('classic');
    // The ELM327 ends every answer with '>', so use it as the message delimiter.
    this.dev = await RNBC.connectToDevice(this.address, { delimiter: '>', charset: 'ascii' });
    this.sub = this.dev.onDataReceived((e: { data: string }) => this.onData(e.data + '>'));
  }
  async write(s: string) { await this.dev.write(s, 'ascii'); }
  async close() {
    this.sub?.remove();
    try { await this.dev?.disconnect(); } catch {}
  }
}

// ---------- Bluetooth LE (Vgate iCar Pro BLE, OBDLink CX, "BLE 4.0" clones) ----------
// Service UUIDs used by common BLE ELM327 clones (FFF0, FFE0, 18F0) and Vgate iCar Pro.
const BLE_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

let manager: any = null;
const bleManager = () => (manager ??= new (load<any>('ble').BleManager)());

const b64 = {
  enc: (s: string) => btoa(s),
  dec: (s: string) => atob(s),
};

export async function scanBle(seconds = 6): Promise<FoundDevice[]> {
  const m = bleManager();
  await askPermissions();
  const found = new Map<string, FoundDevice>();
  await new Promise<void>((resolve, reject) => {
    m.startDeviceScan(null, null, (err: Error | null, d: any) => {
      if (err) { m.stopDeviceScan(); reject(err); return; }
      if (d?.name || d?.localName) found.set(d.id, { id: d.id, name: d.name || d.localName });
    });
    setTimeout(() => { m.stopDeviceScan(); resolve(); }, seconds * 1000);
  });
  // Likely adapters first.
  return [...found.values()].sort((a, b) => +/obd|elm|vlink|vgate|icar|obdlink/i.test(b.name) - +/obd|elm|vlink|vgate|icar|obdlink/i.test(a.name));
}

export class BleTransport implements Transport {
  onData = (_: string) => {};
  private dev: any;
  private tx: any;
  private sub: any;
  constructor(private id: string) {}
  async open() {
    const m = bleManager();
    this.dev = await (await m.connectToDevice(this.id)).discoverAllServicesAndCharacteristics();
    const services = await this.dev.services();
    for (const svc of services.filter((s: any) => BLE_SERVICES.includes(s.uuid.toLowerCase()))) {
      const chars = await svc.characteristics();
      const rx = chars.find((c: any) => c.isNotifiable || c.isIndicatable);
      const tx = chars.find((c: any) => c.isWritableWithoutResponse || c.isWritableWithResponse);
      if (rx && tx) {
        this.tx = tx;
        this.sub = rx.monitor((err: Error | null, c: any) => { if (!err && c?.value) this.onData(b64.dec(c.value)); });
        break;
      }
    }
    if (!this.tx) throw new Error('No ELM327 serial service found on this Bluetooth device.');
  }
  async write(s: string) {
    for (let i = 0; i < s.length; i += 20) {
      const chunk = b64.enc(s.slice(i, i + 20));
      if (this.tx.isWritableWithoutResponse) await this.tx.writeWithoutResponse(chunk);
      else await this.tx.writeWithResponse(chunk);
    }
  }
  async close() {
    this.sub?.remove();
    try { await this.dev?.cancelConnection(); } catch {}
  }
}
