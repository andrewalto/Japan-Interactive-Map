# Japan 2026 — Interactive Trip Map

Interactive Leaflet map of a 16-day Japan itinerary (~60 places), being built out as an
installable PWA the travel group can use to add, discuss, and confirm places on the road.

## Project structure

```
index.html                  entry point
css/app.css                 all app styles (sidebar, pins, popups, responsive)
js/data.js                  V1 seed itinerary + category definitions + day colors
js/app.js                   map setup, markers, filtering, sidebar UI, routes
js/store.js                 shared places store (Firestore; local fallback)
js/firebase-config.js       Firebase project keys (public by design)
js/install.js               PWA install banner
sw.js / manifest.json       service worker + web app manifest
firestore.rules             security rules to paste into the Firebase console
vendor/leaflet/             Leaflet 1.9.4 (vendored so the app works offline)
vendor/firebase/            Firebase SDK 12.1.0 (vendored, ditto)
```

## Run locally

Any static file server works. Simplest:

```bash
python3 -m http.server 8901
```

then open http://localhost:8901

## Deploy

GitHub Pages serves the `main` branch. V2 development happens on the `v2` branch;
merge to `main` to deploy.

## Version history

- **V1** (`main`): single-file map — markers, day/category filters, search, route view.
- **V2** (in progress): multi-file structure, PWA (installable + offline), Firebase Firestore
  backend for collaborative candidate/confirmed places.
