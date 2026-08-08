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
├── css/styles.css          # Styles
├── data/                   # Race & training data (edit these to update the app)
│   ├── marathons.json
│   ├── half-marathons.json
│   ├── trails.json
│   ├── training.json
│   ├── countries.json
│   ├── goals.json
│   ├── activities.json      # Generated locally from Garmin (gitignored)
│   ├── marathon-tracks.json # From FIT import (gitignored)
│   └── fits/marathons/      # Garmin ZIP/FIT exports (gitignored)
└── js/
    ├── app.js              # Bootstrap
    ├── store.js            # Load data, compute stats
    ├── theme.js            # Dark/light + localStorage
    ├── tabs.js             # Lazy tab loading
    ├── export.js           # CSV export
    ├── goals.js            # Milestones UI
    ├── activities-utils.js # Activities filters & aggregates
    ├── activities-tab.js   # Garmin Activities tab
    ├── marathons-tab.js
    ├── half-tab.js
    ├── training-tab.js
    └── trail-tab.js
```

## Garmin activities import

1. Export your data from [Garmin Connect](https://connect.garmin.com) (Account → Export Data) and extract to `DI_CONNECT/`.
2. Run the import script:

```bash
node scripts/import-garmin.mjs
```

This regenerates `data/activities.json` with activities, PRs, daily heatmap data, race matching, and Garmin-vs-training comparison. Keep `data/activities.json` and `data/marathon-tracks.json` local only — they are gitignored. Do **not** commit `DI_CONNECT/` either.

Optional: add device display names in `DEVICE_NAMES` inside `scripts/import-garmin.mjs`.

## Activity GPS page

Marathons with imported FIT open a Garmin-style detail page:

```text
activity.html?id=23816379030
activity.html?race=Rostock%20Night&year=2026
```

For full charts (HR, cadence, ground contact, power, elevation, pace):

1. In Garmin Connect → activity → export **Original** (ZIP containing `.fit`)
2. Save as `data/{id}.zip` or `data/fits/marathons/{id}.zip`
3. Run:

```bash
node scripts/import-marathon-fit.mjs
```

That updates `data/marathon-tracks.json` and `data/activity-details/{id}.json` (both gitignored).

## Adding a marathon

Edit `data/marathons.json` — add an object with `name`, `year`, `time`, `country`, `major`, `lat`, and `lng`:

```json
{ "name": "Berlin", "year": 2027, "time": "2:50", "country": "GER", "major": true, "lat": 52.5, "lng": 13.4 }
```

Country counts and header stats recompute automatically on reload.

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
node scripts/import-garmin.mjs       # Import Garmin DI_CONNECT export → data/activities.json
node scripts/import-marathon-fit.mjs # FIT/ZIP in data/ or data/fits/marathons/ → tracks + charts
node scripts/extract-data.mjs        # Regenerate JSON from monolith backup (legacy)
node scripts/build-index.mjs         # Rebuild index.html from monolith backup
node scripts/test-load.mjs           # Verify JS bundles load locally
```
