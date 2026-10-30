// Web preview only (react-native-maps has no web version): the route drawn on a dark grid, no map tiles.
// The phone app shows a real map.
import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C } from '../lib/theme';

export function TripMap({ path, height = 220 }: { path: [number, number][]; height?: number }) {
  const [w, setW] = useState(0);
  const lats = path.map(p => p[0]), lngs = path.map(p => p[1]);
  const lat0 = Math.min(...lats), lat1 = Math.max(...lats), lng0 = Math.min(...lngs), lng1 = Math.max(...lngs);
  const pad = 40, sx = (w - 2 * pad) / (lng1 - lng0 || 1), sy = (height - 2 * pad) / (lat1 - lat0 || 1), s = Math.min(sx, sy);
  const xy = path.map(([la, ln]) => [w / 2 + (ln - (lng0 + lng1) / 2) * s, height / 2 - (la - (lat0 + lat1) / 2) * s]);
  const [a, b] = [xy[0], xy[xy.length - 1]];
  const d = xy.length === 2 ? `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + 30},${(a[1] + b[1]) / 2 - 30} ${b[0]},${b[1]}` : xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join('');
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: '#10161e', borderWidth: 1, borderColor: C.line }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {Array.from({ length: 12 }, (_, i) => <Line key={'v' + i} x1={i * 36} y1={0} x2={i * 36 - 40} y2={height} stroke="#1a222c" strokeWidth={6} />)}
          {Array.from({ length: 8 }, (_, i) => <Line key={'h' + i} x1={0} y1={i * 34} x2={w} y2={i * 34 + 20} stroke="#1a222c" strokeWidth={4} />)}
          <Path d={d} stroke={C.accent} strokeOpacity={0.25} strokeWidth={12} fill="none" strokeLinecap="round" />
          <Path d={d} stroke={C.accent} strokeWidth={4} fill="none" strokeLinecap="round" />
          <Circle cx={a[0]} cy={a[1]} r={9} fill={C.ok} stroke="#fff" strokeWidth={2} />
          <Circle cx={b[0]} cy={b[1]} r={9} fill={C.bad} stroke="#fff" strokeWidth={2} />
        </Svg>
      )}
    </View>
  );
}
