// Web version (react-native-maps has no web build): map tiles from CARTO's dark OpenStreetMap style, positioned with
// Web Mercator maths, and the GPS trace drawn on top in SVG. If the tiles can't load, the dark grid underneath remains.
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C } from '../lib/theme';

const TILE = 256;
const project = (lat: number, lng: number, z: number) => {
  const s = TILE * 2 ** z, r = (lat * Math.PI) / 180;
  return [((lng + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
};

export function TripMap({ path, height = 220, compact = false }: { path: [number, number][]; height?: number; compact?: boolean }) {
  const [w, setW] = useState(0);
  const pad = compact ? 18 : 36;
  let z = 16, pts: number[][] = [], minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (w > 0) {
    for (; z > 3; z--) { // the largest zoom where the whole route fits
      pts = path.map(([la, ln]) => project(la, ln, z));
      minX = Math.min(...pts.map(p => p[0])); maxX = Math.max(...pts.map(p => p[0]));
      minY = Math.min(...pts.map(p => p[1])); maxY = Math.max(...pts.map(p => p[1]));
      if (maxX - minX <= w - 2 * pad && maxY - minY <= height - 2 * pad) break;
    }
  }
  const ox = (minX + maxX) / 2 - w / 2, oy = (minY + maxY) / 2 - height / 2; // world pixel at the top-left corner
  const xy = pts.map(([x, y]) => [x - ox, y - oy]);
  const tiles: { x: number; y: number; key: string }[] = [];
  if (w > 0) for (let tx = Math.floor(ox / TILE); tx * TILE < ox + w; tx++) for (let ty = Math.floor(oy / TILE); ty * TILE < oy + height; ty++) tiles.push({ x: tx, y: ty, key: `${z}/${tx}/${ty}` });
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const a = xy[0], b = xy[xy.length - 1], r = compact ? 6 : 9;
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height, borderRadius: compact ? 16 : 20, overflow: 'hidden', backgroundColor: C.mapBg, borderWidth: 1, borderColor: C.line }}>
      {w > 0 && (
        <>
          <Svg width={w} height={height} style={{ position: 'absolute' }}>
            {Array.from({ length: 16 }, (_, i) => <Line key={'v' + i} x1={i * 36} y1={0} x2={i * 36 - 40} y2={height} stroke={C.mapGrid} strokeWidth={5} />)}
            {Array.from({ length: 9 }, (_, i) => <Line key={'h' + i} x1={0} y1={i * 34} x2={w} y2={i * 34 + 20} stroke={C.mapGrid} strokeWidth={3} />)}
          </Svg>
          {tiles.map(tl => (
            <Image key={tl.key} source={{ uri: `https://${'abcd'[(tl.x + tl.y) & 3]}.basemaps.cartocdn.com/${C.tiles}/${tl.key}${typeof devicePixelRatio !== 'undefined' && devicePixelRatio > 1 ? '@2x' : ''}.png` }}
              style={{ position: 'absolute', left: tl.x * TILE - ox, top: tl.y * TILE - oy, width: TILE, height: TILE }} />
          ))}
          <Svg width={w} height={height} style={{ position: 'absolute' }}>
            <Path d={d} stroke={C.accent} strokeOpacity={0.25} strokeWidth={compact ? 8 : 12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Path d={d} stroke={C.accent} strokeWidth={compact ? 3 : 4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={a[0]} cy={a[1]} r={r} fill={C.ok} stroke={C.panel} strokeWidth={2} />
            <Circle cx={b[0]} cy={b[1]} r={r} fill={C.bad} stroke={C.panel} strokeWidth={2} />
          </Svg>
          {!compact ? <Text style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 9, color: C.muted }}>© OpenStreetMap © CARTO</Text> : null}
        </>
      )}
    </View>
  );
}
