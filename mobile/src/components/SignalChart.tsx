// Line chart for logged signals: several lines in one chart, each on the left or the right y-axis (signals on the same
// side share its scale). Drag a finger (or the mouse) across it to read every value at that moment.
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { num, t } from '../lib/i18n';
import { C } from '../lib/theme';

export type Series = { key: string; label: string; unit: string; color: string; axis: 'L' | 'R'; points: [number, number][]; dp: number };

// "Nice" axis ticks: steps of 1, 2 or 5 × 10^n.
function nice(lo: number, hi: number, n = 4) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { lo: a, hi: b, ticks };
}
const fmtT = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
const short = (v: number) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(+v.toFixed(2)));

export function SignalChart({ series, height = 200 }: { series: Series[]; height?: number }) {
  const [w, setW] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null); // x in px
  const left = series.some(s => s.axis === 'L'), right = series.some(s => s.axis === 'R');
  const padL = left ? 40 : 10, padR = right ? 40 : 10, padT = 10, padB = 22;
  const pw = Math.max(1, w - padL - padR), ph = height - padT - padB;

  const model = useMemo(() => {
    const all = series.flatMap(s => s.points);
    if (!all.length) return null;
    const t0 = Math.min(...all.map(p => p[0])), t1 = Math.max(...all.map(p => p[0]));
    const axis = (side: 'L' | 'R') => {
      const ys = series.filter(s => s.axis === side).flatMap(s => s.points.map(p => p[1]));
      return ys.length ? nice(Math.min(...ys), Math.max(...ys)) : null;
    };
    return { t0, t1, L: axis('L'), R: axis('R') };
  }, [series]);

  if (!model) return <View style={{ height }} className="items-center justify-center"><Text className="text-muted">{t('No data')}</Text></View>;
  const { t0, t1 } = model;
  const X = (tt: number) => padL + ((tt - t0) / (t1 - t0 || 1)) * pw;
  const Y = (v: number, side: 'L' | 'R') => { const a = model[side]!; return padT + ph - ((v - a.lo) / (a.hi - a.lo || 1)) * ph; };
  const step = (n: number) => Math.max(1, Math.floor(n / Math.max(50, pw / 2))); // about one point per 2 px

  const paths = series.map(s => {
    const k = step(s.points.length);
    return s.points.filter((_, i) => i % k === 0 || i === s.points.length - 1).map(([tt, v], i) => `${i ? 'L' : 'M'}${X(tt).toFixed(1)},${Y(v, s.axis).toFixed(1)}`).join('');
  });
  const gridAxis = model.L ? 'L' : 'R';
  const xTicks = Array.from({ length: 5 }, (_, i) => t0 + ((t1 - t0) * i) / 4);

  // values under the cursor
  const ct = cursor == null ? null : t0 + ((Math.min(Math.max(cursor, padL), padL + pw) - padL) / pw) * (t1 - t0);
  const at = (s: Series) => {
    if (ct == null || !s.points.length) return null;
    let lo = 0, hi = s.points.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; s.points[m][0] < ct ? (lo = m) : (hi = m); }
    return Math.abs(s.points[lo][0] - ct) < Math.abs(s.points[hi][0] - ct) ? s.points[lo] : s.points[hi];
  };
  const move = (e: any) => setCursor(e.nativeEvent.locationX);

  return (
    <View>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height, userSelect: 'none' } as any}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={move} onResponderMove={move} onResponderRelease={() => {}} onResponderTerminationRequest={() => false}
        // @ts-ignore web only: follow the mouse without a click
        onMouseMove={move}>
        {w > 0 && (
          <Svg width={w} height={height} pointerEvents="none">
            {model[gridAxis]!.ticks.map(v => (
              <Line key={'g' + v} x1={padL} x2={padL + pw} y1={Y(v, gridAxis)} y2={Y(v, gridAxis)} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
            ))}
            {(['L', 'R'] as const).map(side => {
              const a = model[side];
              if (!a) return null;
              const on = series.filter(s => s.axis === side), col = on.length === 1 ? on[0].color : C.muted;
              return a.ticks.map(v => (
                <SvgText key={side + v} x={side === 'L' ? padL - 6 : padL + pw + 6} y={Y(v, side) + 3.5} fontSize={10} fill={col} textAnchor={side === 'L' ? 'end' : 'start'}>{short(v)}</SvgText>
              ));
            })}
            {xTicks.map((tt, i) => (
              <SvgText key={'x' + i} x={X(tt)} y={height - 6} fontSize={10} fill={C.muted} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{fmtT(tt)}</SvgText>
            ))}
            {paths.map((d, i) => <Path key={series[i].key + series[i].axis} d={d} stroke={series[i].color} strokeWidth={2} fill="none" strokeLinejoin="round" />)}
            {ct != null ? (
              <G>
                <Line x1={X(ct)} x2={X(ct)} y1={padT} y2={padT + ph} stroke={C.text} strokeOpacity={0.5} strokeWidth={1} />
                {series.map(s => { const p = at(s); return p ? <Rect key={'c' + s.key} x={X(p[0]) - 4} y={Y(p[1], s.axis) - 4} width={8} height={8} rx={4} fill={s.color} stroke={C.bg} strokeWidth={1.5} /> : null; })}
              </G>
            ) : null}
          </Svg>
        )}
      </View>
      {/* the values under the cursor, or the min–max of each line */}
      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        {ct != null ? <Text className="text-xs font-bold text-text">{fmtT(ct)}</Text> : null}
        {series.map(s => {
          const p = at(s), ys = s.points.map(q => q[1]);
          return (
            <View key={s.key} className="flex-row items-center">
              <View style={{ backgroundColor: s.color }} className="mr-1.5 h-2 w-2 rounded-full" />
              <Text className="text-xs text-muted">
                {p ? `${num(p[1], s.dp)} ${t(s.unit)}` : ys.length ? `${num(Math.min(...ys), s.dp)}–${num(Math.max(...ys), s.dp)} ${t(s.unit)}` : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
