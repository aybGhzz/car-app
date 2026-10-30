# Car app

An ELM327 OBD-II car scanner: live gauges, trouble codes, trips, maintenance and car papers, for several cars.
Clean-room build: features come from public descriptions of apps like Car Scanner; no app was decompiled.

**Try it in the browser:** https://aybghzz.github.io/car-app/ (built-in simulator, no car needed)

| Folder | What it is |
|---|---|
| [`mobile/`](mobile/) | The app: React Native (Expo) + NativeWind + Reanimated, for Android, iPhone and the web. See its README to run it or build an APK. |
| [`web-poc/`](web-poc/) | The first proof of concept: plain HTML/JS, talks to adapters with Web Serial / Web Bluetooth from desktop Chrome. |

The web version of the app is published automatically by `.github/workflows/pages.yml` on every push to `main`.
It runs on the simulator only: real adapters need the phone app (Bluetooth), see `mobile/README.md`.
