// Trip map with the GPS trace and start/end pins, drawn by MapLibre (open-source map engine) with OpenFreeMap's
// OpenStreetMap vector tiles: free, no API key, no usage limit. The web app keeps the tile map (TripMap.web.tsx).
import { View } from 'react-native';
import { Camera, GeoJSONSource, Layer, Map, Marker } from '@maplibre/maplibre-react-native';
import { C } from '../lib/theme';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export function TripMap({ path, height = 220, compact = false }: { path: [number, number][]; height?: number; compact?: boolean }) {
  if (!path.length) return null;
  const lats = path.map(p => p[0]), lngs = path.map(p => p[1]);
  const pad = 0.002; // keeps a single point or a short trip from zooming in to street level
  const bounds: [number, number, number, number] = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
  const line = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(([lat, lng]) => [lng, lat]) } } as GeoJSON.Feature;
  const start = path[0], end = path[path.length - 1];
  const interactive = !compact;
  return (
    <View style={{ height, borderRadius: compact ? 16 : 20, overflow: 'hidden', backgroundColor: C.mapBg }} pointerEvents={compact ? 'none' : 'auto'}>
      <Map style={{ flex: 1 }} mapStyle={STYLE} logo={false} compass={false} attribution={!compact}
        dragPan={interactive} touchZoom={interactive} touchRotate={false} touchPitch={false}>
        <Camera initialViewState={{ bounds, padding: { top: 28, right: 28, bottom: 28, left: 28 } }} />
        {path.length > 1 ? (
          <GeoJSONSource id="trip" data={line}>
            <Layer id="trip-casing" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }} paint={{ 'line-color': '#ffffff', 'line-width': 7 }} />
            <Layer id="trip-line" type="line" layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': C.accent, 'line-width': 4, ...(path.length === 2 ? { 'line-dasharray': [2, 1.5] } : {}) }} />
          </GeoJSONSource>
        ) : null}
        <Marker lngLat={[start[1], start[0]]}><Pin color={C.ok} /></Marker>
        {path.length > 1 ? <Marker lngLat={[end[1], end[0]]}><Pin color={C.bad} /></Marker> : null}
      </Map>
    </View>
  );
}

function Pin({ color }: { color: string }) {
  return <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color, borderWidth: 3, borderColor: '#fff' }} />;
}
