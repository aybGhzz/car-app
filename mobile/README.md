# OBD Scanner app (React Native)

The phone version of the [web POC](../web-poc/), rebuilt so the interface feels alive:
gauges swing on springs, cards slide in, bars grow, charts draw themselves, sheets follow your finger.
It is a clean-room build, like the POC. Nothing was taken from the Car Scanner APK.

One codebase for Android and iPhone. The web POC is unchanged.

## What it is built with

| Piece | What it does here |
|---|---|
| [Expo](https://expo.dev) SDK 58 + React Native 0.88 | The app, Android and iOS from one codebase |
| [NativeWind](https://www.nativewind.dev) 4 (Tailwind for React Native) | All styling, e.g. `className="rounded-3xl bg-panel p-4"` |
| [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/) 4 | Gauge needles and arcs on springs, staggered card entry, count-up numbers, the codes radar, tab highlight, shift lights |
| [react-native-gesture-handler](https://docs.swmansion.com/react-native-gesture-handler/) 3 | Drag-to-close sheets, swipe a service card left to mark it done |
| Expo Router | Tabs and the trip detail page |
| react-native-svg | Gauges, line charts, countdown rings |
| react-native-maps | Trip map (Google Maps on Android, Apple Maps on iOS) |
| react-native-bluetooth-classic, react-native-ble-plx | Real ELM327 adapters (classic Bluetooth on Android, Bluetooth LE on both) |

gluestack-ui is not used: NativeWind already covers the styling, and the few components the app needs
(button, sheet, pill, card) are in `src/components/ui.tsx` and `Sheet.tsx`. Flutter, SwiftUI and Jetpack
Compose would each be a full rewrite in another language, so they are not part of this project.

## Screens

- **Dashboard**: big speedometer with shift lights, your own gauges (tap one to change its sensor, add or remove), live trip numbers. "All sensors" lists every supported PID live.
- **Codes**: radar sweep while reading stored, pending and permanent codes, check-engine status, readiness monitors, clear codes.
- **Trips**: last 7 days, distance per day, trip cards; a trip shows its map, road-type split (still the random placeholder), speed, temperatures, consumption, hard accelerations and braking.
- **Service**: odometer (manual, or read from the car with PID A6), one card per item with a bar to the next service. Swipe left = done now, tap = edit.
- **Ownership**: Moroccan plate, insurance and visite technique with a countdown ring, call roadside assistance.
- **My cars**: the list of your cars (BMW 525i E60 and X5 xDrive to start), each with its mileage, trip count, km this week and what
  needs attention next (service item, insurance, visite technique). Tap a car to select it, the pencil to edit it, "Add a car" for a new one.
- **Add / edit a car**: make, model, year, plate, fuel, engine, gearbox, note, VIN, odometer, fuel price, insurance and visite technique.
  A new car gets a starter maintenance list from its odometer (petrol, diesel and electric lists differ). A car can be deleted
  with its trips and maintenance (not the last one).
- **Everything is per car**: the chips at the top of every tab pick the car; trips, service list, odometer, fuel price and papers
  belong to that car. A connection belongs to the car selected when you connect; if you look at another car while connected, a
  banner says where the live data comes from. Mileages, service history, insurance and inspection dates are demo values.
- **Language**: the round button in the header (English, French, Spanish; default follows the phone).

`features/` has screenshots of every screen in the three languages, and `features/demo.mp4` is a 3-minute captioned walkthrough (screens `9-*` show the cars list and editor).
They were taken from the web build with the simulator, so the trip map there is a simple drawing; the phone shows a real map.

## Try it in the browser

The web build is published at https://aybghzz.github.io/car-app/ (simulator only).
On your own computer: `npm install` then `npm run web`.

## Try it on your phone (simulator, no car needed)

This needs a computer once, to run the development server.

1. Install the **Expo Go** app on the phone (Play Store or App Store).
2. On the computer, with Node.js 20 or newer:
   ```bash
   cd mobile
   npm install
   npm start          # same Wi-Fi as the phone; if that fails: npx expo start --go --tunnel
   ```
3. Scan the QR code: with Expo Go on Android, with the Camera app on iPhone.
4. Tap **Start the simulator**.

In Expo Go only the simulator works, because Expo Go cannot load the Bluetooth libraries.

## Use a real ELM327 adapter

Build the app once with EAS (free Expo account, builds in the cloud, no Android Studio needed):

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview      # gives a link to an .apk to install
# or, for development with live reload:
npx eas-cli@latest build -p android --profile development && npm run start:dev-build
```

Then tap the connection button in the header:

| Adapter | Phone |
|---|---|
| Classic Bluetooth ELM327 (most cheap ones). Pair it in Android Bluetooth settings first, PIN 1234 or 0000 | Android only (iPhone has no classic serial Bluetooth) |
| Bluetooth LE (Vgate iCar Pro BLE, OBDLink CX, "BLE 4.0" clones) | Android and iPhone |

An iPhone build needs an Apple developer account (`eas build -p ios`).

## Files

- `src/app/`: screens (`(tabs)/index.tsx` dashboard, `codes.tsx`, `trips.tsx`, `service.tsx`, `car.tsx`, `trip/[id].tsx`, `sensors.tsx`, `cars.tsx` list, `car-edit/[id].tsx` add/edit)
- `src/components/`: `Gauge.tsx`, `charts.tsx` (line, bars, progress, road split), `Sheet.tsx`, `TabBar.tsx`, `Ring.tsx`, `ui.tsx`
- `src/lib/obd/`: the ELM327 parser, OBD-II services, simulator and trouble-code list, copied from the web POC
- `src/lib/transports/bluetooth.ts`: classic Bluetooth and BLE transports
- `src/lib/live.ts`: connection, polling (only the PIDs on screen) and trip recording
- `src/lib/garage.ts`: trip statistics, demo trips, ownership and service data
- `src/lib/i18n*.ts|js`: translations (the POC's tables plus the app's new strings in `i18n-app.ts`)
- Data is stored on the phone (AsyncStorage). There is no backend yet.

## Checks

```bash
npx tsc --noEmit        # typecheck
npx expo export -p web  # web build used for the screenshots
```

Not yet tested: on a real phone, and with a real adapter. The Bluetooth code follows each library's
documented API but has only been type-checked.
