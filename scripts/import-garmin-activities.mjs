/**
 * Import running activities from a Garmin Connect DI_CONNECT export.
 *
 * Usage:
 *   node scripts/import-garmin-activities.mjs
 *   node scripts/import-garmin-activities.mjs --update-training
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const RUN_TYPES = new Set([
  'running', 'trail_running', 'street_running', 'track_running',
  'treadmill_running', 'virtual_run', 'ultra_run', 'indoor_running',
]);

const DEFAULT_SOURCES = ['DI_CONNECT', 'garmin_data/DI_CONNECT'];

function parseArgs(argv) {
  const args = { sources: DEFAULT_SOURCES, updateTraining: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) {
      args.sources = [argv[++i]];
    } else if (argv[i] === '--update-training') {
      args.updateTraining = true;
    }
  }
  return args;
}

function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(secPerKm) {
  if (!secPerKm || !Number.isFinite(secPerKm)) return '';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toDateString(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function normalizeActivity(raw) {
  const durationMs = raw.movingDuration || raw.duration || 0;
  const durationSec = Math.round(durationMs / 1000);
  const km = raw.distance / 100000;
  const paceSec = km > 0 ? durationSec / km : null;

  return {
    id: raw.activityId,
    date: toDateString(raw.startTimeGmt),
    startTime: raw.startTimeGmt || null,
    name: raw.name || 'Run',
    type: raw.activityType,
    km: Math.round(km * 100) / 100,
    duration: fmtDuration(durationSec),
    durationSec,
    pace: fmtPace(paceSec),
    paceSec: paceSec ? Math.round(paceSec) : null,
    avgHr: raw.avgHr || null,
    maxHr: raw.maxHr || null,
    elevGain: raw.elevationGain ? Math.round(raw.elevationGain / 100) : null,
    elevLoss: raw.elevationLoss ? Math.round(raw.elevationLoss / 100) : null,
    location: raw.locationName || null,
    lat: raw.startLatitude || null,
    lng: raw.startLongitude || null,
    endLat: raw.endLatitude || null,
    endLng: raw.endLongitude || null,
    calories: raw.calories ? Math.round(raw.calories) : null,
    vo2max: raw.vO2MaxValue || null,
    trainingLoad: raw.activityTrainingLoad ? Math.round(raw.activityTrainingLoad) : null,
    trainingEffect: raw.trainingEffectLabel || null,
    avgPower: raw.avgPower ? Math.round(raw.avgPower) : null,
    cadence: raw.avgRunCadence ? Math.round(raw.avgRunCadence) : null,
    isPr: !!raw.pr,
  };
}

function loadGarminActivities(sources) {
  const byId = new Map();

  for (const sourceDir of sources) {
    const fitnessDir = path.join(root, sourceDir, 'DI-Connect-Fitness');
    if (!fs.existsSync(fitnessDir)) {
      console.warn(`  Skipping missing ${fitnessDir}`);
      continue;
    }

    const files = fs.readdirSync(fitnessDir).filter(f => f.includes('summarizedActivities')).sort();
    for (const file of files) {
      const payload = JSON.parse(fs.readFileSync(path.join(fitnessDir, file), 'utf8'));
      const batch = payload[0]?.summarizedActivitiesExport || [];
      for (const act of batch) {
        if (!RUN_TYPES.has(act.activityType)) continue;
        byId.set(act.activityId, act);
      }
      console.log(`  ${sourceDir}/${file}: ${batch.length} activities`);
    }
  }

  if (!byId.size) throw new Error('No activities found in any source');

  return [...byId.values()]
    .map(normalizeActivity)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function aggregateByYear(activities) {
  const byYear = {};
  for (const act of activities) {
    const year = Number(act.date.slice(0, 4));
    if (!byYear[year]) byYear[year] = { year, km: 0, runs: 0, durationSec: 0 };
    byYear[year].km += act.km;
    byYear[year].runs += 1;
    byYear[year].durationSec += act.durationSec;
  }
  return Object.values(byYear)
    .map(y => ({ year: y.year, km: Math.round(y.km), runs: y.runs, time: fmtDuration(y.durationSec) }))
    .sort((a, b) => a.year - b.year);
}

function mergeTraining(existing, garminYears) {
  const existingByYear = Object.fromEntries(existing.map(y => [y.year, y]));
  const garminByYear = Object.fromEntries(garminYears.map(y => [y.year, y]));
  const allYears = [...new Set([...existing.map(y => y.year), ...garminYears.map(y => y.year)])].sort();
  return allYears.map(year => {
    const prev = existingByYear[year];
    const next = garminByYear[year];
    if (!next) return prev;
    if (!prev) return next;
    if (prev.runs > next.runs || prev.km > next.km) return prev;
    return next;
  });
}

function main() {
  const args = parseArgs(process.argv);
  console.log('Importing Garmin activities...');
  const activities = loadGarminActivities(args.sources);

  const years = new Set(activities.map(a => a.date.slice(0, 4)));
  const dateRange = activities.length
    ? { from: activities[activities.length - 1].date, to: activities[0].date }
    : null;

  const out = {
    meta: {
      source: 'Garmin Connect',
      importedAt: new Date().toISOString(),
      count: activities.length,
      years: [...years].sort(),
      dateRange,
    },
    activities,
  };

  const outPath = path.join(root, 'data', 'activities.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  console.log(`Wrote ${activities.length} activities to data/activities.json`);

  if (args.updateTraining) {
    const trainingPath = path.join(root, 'data', 'training.json');
    const existing = fs.existsSync(trainingPath) ? JSON.parse(fs.readFileSync(trainingPath, 'utf8')) : [];
    fs.writeFileSync(trainingPath, JSON.stringify(mergeTraining(existing, aggregateByYear(activities)), null, 2));
    console.log('Updated data/training.json');
  }
}

main();
