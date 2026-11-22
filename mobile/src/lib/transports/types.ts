export interface Transport {
  onData: (text: string) => void;
  onLost?: () => void; // the link dropped (adapter unplugged, out of range, Bluetooth turned off)
  open(): Promise<void>;
  write(text: string): Promise<void>;
  close(): Promise<void>;
}

export type ConnKind = 'sim' | 'classic' | 'ble';

export interface FoundDevice {
  id: string;
  name: string;
}
