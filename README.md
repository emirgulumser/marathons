# Marathon & Running Log

Personal running dashboard — marathons, half marathons, trail races, and annual training volume.

**Live site:** enable GitHub Pages (Settings → Pages → Source: GitHub Actions) after pushing to `main`.

## Quick start

Data is loaded from JSON via `fetch`, so open the app through a local HTTP server (not `file://`):

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then visit `http://localhost:8080`.

## Project structure

```
├── index.html              # App shell
├── activity.html           # Garmin-style race activity page
├── css/styles.css          # Styles
├── data/                   # Race & training data
│   ├── marathons.json
│   ├── half-marathons.json
│   ├── trails.json
│   ├── training.json
│   ├── countries.json
│   ├── goals.json
│   ├── activities.json      # From Garmin import
│   ├── marathon-tracks.json # From FIT import
│   ├── activity-details/    # FIT-derived chart series
│   └── fits/marathons/      # Garmin ZIP exports (source files)
└── js/
    ├── app.js
    ├── store.js
    ├── marathon-charts.js   # Finish-time distribution & chart helpers
    ├── marathons-tab.js
    ├── activities-tab.js
    └── …
```

## Garmin activities import

### One-command refresh (recommended)

Save your Garmin Connect export as e.g. `data/new.zip`, then:

```bash
node scripts/refresh-garmin.mjs data/new.zip --update-training
```

This extracts `DI_CONNECT/DI-Connect-Fitness/`, runs `import-garmin.mjs`, and optionally updates `data/training.json`.

### Manual import

1. Export from [Garmin Connect](https://connect.garmin.com) and extract to `DI_CONNECT/`.
2. Run:

```bash
node scripts/import-garmin.mjs
```

Regenerates `data/activities.json` with activities, PRs, heatmap data, race matching, and predictions.

Do **not** commit `DI_CONNECT/` or raw export ZIPs (they may contain account email in filenames).

Optional: add device display names in `DEVICE_NAMES` inside `scripts/import-garmin.mjs`.

## Activity GPS page

Marathons with imported FIT open a Garmin-style detail page:

```text
activity.html?id=23816379030
activity.html?race=Rostock%20Night&year=2026
```

For full charts (HR, cadence, ground contact, power, elevation, pace):

1. In Garmin Connect → activity → export **Original** (ZIP containing `.fit`)
2. Save as `data/fits/marathons/{id}.zip`
3. Run:

```bash
node scripts/import-marathon-fit.mjs
```

Updates `data/marathon-tracks.json` and `data/activity-details/{id}.json`.

## Adding a marathon

Edit `data/marathons.json` — add an object with `name`, `year`, `time`, `country`, `major`, `lat`, and `lng`:

```json
{ "name": "Berlin", "year": 2027, "time": "2:50", "country": "GER", "major": true, "lat": 52.5, "lng": 13.4 }
```

Then import FIT if available and fetch weather:

```bash
node scripts/import-marathon-fit.mjs
node scripts/fetch-race-weather.mjs
```

## Adding a half marathon

Edit `data/half-marathons.json`:

```json
{ "name": "Ankara", "year": 2027, "time": "1:27", "country": "TUR", "lat": 39.93, "lng": 32.86 }
```

## Goals

Edit targets in `data/goals.json`. Supported metrics: `marathons`, `sub3`, `countries`, `marathon_pb`, `training_km`, `majors_complete`.

## Deploy

Push to `main` — the GitHub Actions workflow in `.github/workflows/pages.yml` deploys the site automatically once Pages is configured.

## Scripts

```bash
node scripts/refresh-garmin.mjs data/new.zip --update-training
node scripts/import-garmin.mjs       # Import DI_CONNECT → data/activities.json
node scripts/import-marathon-fit.mjs # FIT/ZIP → tracks + activity details
node scripts/fetch-race-weather.mjs  # Race-day weather JSON
node scripts/test-load.mjs           # Verify JS bundles load locally
node scripts/test-marathon-charts.mjs
node scripts/test-race-prediction.mjs
```
