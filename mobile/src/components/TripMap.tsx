// Trip map with the GPS trace and start/end pins. iOS uses Apple Maps (react-native-maps). Android uses the same
// OpenStreetMap tile map as the web app, so no Google Maps API key is needed.
import { Platform } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { C } from '../lib/theme';
import { TripMap as TileMap } from './TripMapTiles';

export function TripMap(props: { path: [number, number][]; height?: number; compact?: boolean }) {
  return Platform.OS === 'android' ? <TileMap {...props} /> : <NativeMap {...props} />;
}

function NativeMap({ path, height = 220, compact = false }: { path: [number, number][]; height?: number; compact?: boolean }) {
  const lats = path.map(p => p[0]), lngs = path.map(p => p[1]);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.4 + 0.01, longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.4 + 0.01,
  };
  const coords = path.map(([latitude, longitude]) => ({ latitude, longitude }));
  return (
    <MapView style={{ height, borderRadius: compact ? 16 : 20 }} initialRegion={region} userInterfaceStyle={C.dark ? "dark" : "light"} toolbarEnabled={false}
      liteMode={compact} scrollEnabled={!compact} zoomEnabled={!compact} pitchEnabled={false} rotateEnabled={false} pointerEvents={compact ? 'none' : 'auto'}>
      <Polyline coordinates={coords} strokeColor={C.accent} strokeWidth={4} lineDashPattern={path.length === 2 ? [10, 8] : undefined} />
      <Marker coordinate={coords[0]} pinColor={C.ok} />
      <Marker coordinate={coords[coords.length - 1]} pinColor={C.bad} />
    </MapView>
  );
}
