// Every command sent to the adapter and every answer, so a wrong or empty result can be explained afterwards.
// The latest lines are kept in memory; the transcript of the last diagnostic request (trouble codes, clear) is also
// saved on the phone, so it is still there after the app restarts. Both can be shared from the app.
import { Platform, Share } from 'react-native';
import { kv } from './store';

const MAX = 5000;
const lines: string[] = [];
let mark: number | null = null; // where the diagnostic request being recorded started, in `lines`
let dropped = 0; // lines pushed out of the buffer since `mark`

const stamp = () => {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
};

// dir: '>' sent, '<' received, '!' error, '#' note (mode switches, app events).
export function adapterLog(dir: string, text: string) {
  lines.push(`${stamp()} ${dir} ${String(text).replace(/\r\n?/g, ' | ')}`);
  if (lines.length > MAX) {
    lines.shift();
    if (mark != null) { if (mark > 0) mark--; else dropped++; }
  }
}

export function startDiagLog(what: string) {
  adapterLog('#', '--- ' + what + ' ---');
  mark = lines.length - 1;
  dropped = 0;
}

export function endDiagLog(header: string) {
  if (mark == null) return;
  const body = (dropped ? `(${dropped} earlier lines lost)\n` : '') + lines.slice(mark).join('\n');
  mark = null;
  kv.set('lastDiagLog', { at: Date.now(), text: header + '\n' + body });
}

export const lastDiagLog = () => kv.get<{ at: number; text: string } | null>('lastDiagLog', null);

export function adapterLogText() {
  return lines.join('\n');
}

export async function shareAdapterLog(which: 'diag' | 'all') {
  const text = which === 'diag' ? lastDiagLog()?.text : adapterLogText();
  if (!text) throw new Error('The log is empty.');
  if (Platform.OS === 'web') { console.log(text); return; }
  await Share.share({ message: text, title: 'Adapter log' });
}
