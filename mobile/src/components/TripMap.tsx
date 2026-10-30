// Native map (Apple Maps on iOS, Google Maps on Android) with the route and start/end pins.
import MapView, { Marker, Polyline } from 'react-native-maps';
import { C } from '../lib/theme';

export function TripMap({ path, height = 220 }: { path: [number, number][]; height?: number }) {
  const lats = path.map(p => p[0]), lngs = path.map(p => p[1]);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: (Math.max(...lats) - Math.min(...lats)) * 1.6 + 0.02, longitudeDelta: (Math.max(...lngs) - Math.min(...lngs)) * 1.6 + 0.02,
  };
  const coords = path.map(([latitude, longitude]) => ({ latitude, longitude }));
  return (
    <MapView style={{ height, borderRadius: 20 }} initialRegion={region} userInterfaceStyle="dark" toolbarEnabled={false}>
      <Polyline coordinates={coords} strokeColor={C.accent} strokeWidth={4} lineDashPattern={path.length === 2 ? [10, 8] : undefined} />
      <Marker coordinate={coords[0]} pinColor={C.ok} />
      <Marker coordinate={coords[coords.length - 1]} pinColor={C.bad} />
    </MapView>
  );
}
