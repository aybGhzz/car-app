// The Vindici mark: two forward chevrons (moving, diagnosing) with a wrench across them (maintenance). Drawn in SVG,
// so it stays sharp at any size and needs no image files.
import { useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { C } from '../lib/theme';

export function LogoMark({ size = 64, mono = false }: { size?: number; mono?: boolean }) {
  const w = size, h = size * 0.8;
  const a = mono ? C.text : '#7fe3d6', b = mono ? C.text : '#0e8a80';
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''); // unique gradient ids: two logos can be on the page at once
  return (
    <Svg width={w} height={h} viewBox="0 0 100 80">
      <Defs>
        <LinearGradient id={"a" + id} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient>
        <LinearGradient id={"b" + id} x1="0" y1="1" x2="1" y2="0"><Stop offset="0" stopColor={b} stopOpacity={0.85} /><Stop offset="1" stopColor={a} /></LinearGradient>
      </Defs>
      <Path d="M6 6 H30 L64 40 L30 74 H6 L40 40 Z" fill={`url(#a${id})`} opacity={mono ? 0.55 : 0.9} />
      <Path d="M36 6 H60 L94 40 L60 74 H36 L70 40 Z" fill={`url(#b${id})`} opacity={mono ? 0.9 : 1} />
      {/* wrench: open jaw on the left, ring on the right */}
      <Path d="M24 40 H70" stroke={mono ? C.bg : '#ffffff'} strokeWidth={7} strokeLinecap="round" />
      <Path d="M24 31 A9 9 0 1 0 24 49" stroke={mono ? C.bg : '#ffffff'} strokeWidth={6} fill="none" strokeLinecap="round" />
      <Circle cx={74} cy={40} r={7} stroke={mono ? C.bg : '#ffffff'} strokeWidth={5} fill="none" />
    </Svg>
  );
}

export function Logo({ size = 64, row = false }: { size?: number; row?: boolean }) {
  return (
    <View style={{ flexDirection: row ? 'row' : 'column', alignItems: 'center' }}>
      <LogoMark size={size} />
      <Text style={{ fontSize: size * (row ? 0.42 : 0.5), color: C.text, fontWeight: '600', letterSpacing: 0.5, marginLeft: row ? size * 0.15 : 0, marginTop: row ? 0 : size * 0.12 }}>Vindici</Text>
    </View>
  );
}
