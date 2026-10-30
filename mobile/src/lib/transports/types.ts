export interface Transport {
  onData: (text: string) => void;
  open(): Promise<void>;
  write(text: string): Promise<void>;
  close(): Promise<void>;
}

export type ConnKind = 'sim' | 'classic' | 'ble';

export interface FoundDevice {
  id: string;
  name: string;
}
