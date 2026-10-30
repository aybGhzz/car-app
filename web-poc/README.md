# OBD Scanner POC

A browser-based ELM327 OBD-II scanner with the main features of the Car Scanner app. It is a clean-room build:
the feature list comes from the app's public Play Store description, and all code here is original. Nothing was
decompiled or copied from the APK.

Plain HTML and JavaScript, no build step, no dependencies.

## Run it

```bash
cd obd-scanner-poc
python3 -m http.server 8000
```

Open http://localhost:8000 in **Chrome or Edge**, pick a connection type and press **Connect**.
(Web Serial and Web Bluetooth need `localhost` or HTTPS, so serve the folder instead of opening the file directly.)

| Connection | Adapter | Browser |
|---|---|---|
| Simulator | none, a fake CAN car is built in | any modern browser |
| ELM327 USB / Bluetooth serial port | USB ELM327, or a classic Bluetooth ELM327 paired with the computer (it shows up as a COM / serial port) | desktop Chrome or Edge |
| ELM327 Bluetooth LE | BLE adapters (Vgate iCar Pro BLE, OBDLink CX, most "BLE 4.0" clones) | Chrome on desktop or Android |

Default baud rate is 38400. Some clones use 9600 or 115200.

## Features

| Car Scanner feature | Here |
|---|---|
| Connect to ELM327 (USB, Bluetooth, BLE) | Web Serial + Web Bluetooth, auto protocol detection (`ATSP0`) |
| Custom dashboard | Dashboard tab: add, remove and change gauges; layout saved in the browser |
| All sensors on one screen | All sensors tab: every supported Mode 01 PID, live |
| Charts | Chart tab: up to 4 live series over the last 60 s |
| Read and clear DTCs with descriptions | Trouble codes tab: stored (03), pending (07), permanent (0A), clear (04), built-in code list |
| Freeze frame | Freeze frame tab (Mode 02) |
| Emissions readiness | Readiness tab (PID 01 01): MIL, monitors complete or incomplete |
| Mode 06 | Mode 06 tab: monitor test results with pass/fail (CAN cars) |
| Vehicle info | VIN, ECU name, calibration ID, protocol, adapter version, battery voltage |
| Extended / custom PIDs | Custom PIDs tab: optional header, any hex command, formula over bytes A, B, C… |
| Acceleration timing | 0–60 km/h, 0–60 mph, 0–100 km/h, with run history |
| Trip computer | Distance, time, average and top speed, fuel used, average and instant consumption |
| HUD mode | Full-screen large digits, mirrored for windshield reflection |
| Data logging | Record CSV button in the header |
| Terminal | Send raw AT / OBD commands, optionally watch all traffic |
| Trips (statistics) | Trips tab: 7-day summary, daily distance chart, trip cards; tap a trip for a map of start/end, speed, temperatures, fuel, hard accelerations/braking and the city / highway / road split (random placeholder for now) |
| Ownership (added) | Insurance (company, policy, expiry, assistance phone with call button) and visite technique annuelle (last/next date, result) with due-date status |
| Service calendar (added) | Oil, filters, gearbox oil, timing belt, brake fluid…: last/next km per item, progress bar with km left; odometer read from the car (PID A6) or entered manually |

Not included (they need make-specific research and are risky to get wrong): manufacturer connection profiles,
coding of hidden settings (VAG, Toyota, Renault), and service functions.

## Files

- `elm327.js`: transports (Web Serial, Web Bluetooth) and the ELM327 command/response layer, including ISO-TP multi-frame parsing
- `obd.js`: SAE J1979 services: PID formulas, DTC decode, freeze frame, readiness, Mode 06, Mode 09, custom PIDs
- `simulator.js`: a fake ELM327 that answers the same text commands as a real adapter, on a repeating 30 s drive cycle
- `dtc-db.js`: generic trouble code descriptions
- `garage.js`: trips, ownership and service calendar
- `lib/leaflet/`: map library (bundled so the app does not depend on a CDN; map tiles come from OpenStreetMap)
- `features/`: screenshots of the trips, ownership and service screens
- `i18n.js`, `dtc-i18n.js`: French / English / Spanish (language picker in the header; to add a language, add a column)
- `app.js`, `index.html`, `style.css`: the UI

## Notes and limits

- Fuel consumption uses PID 5E when the ECU has it; otherwise it estimates from MAF assuming gasoline.
- Units are metric. The interface is in English, French or Spanish; the default follows the browser language.
- Polling speed on a real car is limited by the adapter, typically 5 to 20 PIDs per second. Only the PIDs the
  current tab needs are polled.
- Clear codes only with the engine off and the ignition on.
