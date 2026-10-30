// The web build is only used for previews and screenshots: real adapters need the phone app.
import type { FoundDevice, Transport } from './types';

export class NeedsDevBuild extends Error {}
const unsupported = () => Promise.reject(new Error('Bluetooth adapters need the phone app. In the browser, use the simulator.'));
export const listClassicDevices = (): Promise<FoundDevice[]> => unsupported();
export const scanBle = (): Promise<FoundDevice[]> => unsupported();
export class ClassicTransport implements Transport {
  onData = (_: string) => {};
  constructor(_: string) {}
  open = unsupported;
  write = unsupported;
  close = async () => {};
}
export class BleTransport extends ClassicTransport {}
