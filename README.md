# Japan 2026 — Interactive Trip Map

Interactive Leaflet map of a 16-day Japan itinerary (~60 places), being built out as an
installable PWA the travel group can use to add, discuss, and confirm places on the road.

## Project structure

```
index.html                  entry point
css/app.css                 all app styles (sidebar, pins, popups, responsive)
js/data.js                  trip places + category definitions + day colors
js/app.js                   map setup, markers, filtering, sidebar UI, routes
vendor/leaflet/             Leaflet 1.9.4 (vendored so the app works offline)
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
