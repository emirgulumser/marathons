/**
 * Refresh Garmin data from a Connect export ZIP.
 *
 * Usage:
 *   node scripts/refresh-garmin.mjs data/new.zip
 *   node scripts/refresh-garmin.mjs data/new.zip --update-training
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { zip: null, updateTraining: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--update-training') args.updateTraining = true;
    else if (!argv[i].startsWith('-')) args.zip = argv[i];
  }
  return args;
}

function fmtDurationFromHours(hours) {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}:00`;
}

function mergeTrainingFromSummary(byYear, existing) {
  const garminByYear = Object.fromEntries(
    byYear.map(y => [y.year, {
      year: y.year,
      km: y.km,
      runs: y.runs,
      time: fmtDurationFromHours(y.hours),
    }])
  );
  const allYears = [...new Set([...existing.map(y => y.year), ...byYear.map(y => y.year)])].sort();
  return allYears.map(year => {
    const prev = existing.find(y => y.year === year);
    const next = garminByYear[year];
    if (!next) return prev;
    if (!prev) return next;
    if (prev.runs > next.runs || prev.km > next.km) return prev;
    return next;
  });
}

const args = parseArgs(process.argv);
if (!args.zip) {
  console.error('Usage: node scripts/refresh-garmin.mjs <export.zip> [--update-training]');
  process.exit(1);
}

const zipPath = path.isAbsolute(args.zip) ? args.zip : path.join(root, args.zip);
if (!fs.existsSync(zipPath)) {
  console.error(`ZIP not found: ${zipPath}`);
  process.exit(1);
}

const connectDir = path.join(root, 'DI_CONNECT');
fs.mkdirSync(connectDir, { recursive: true });

console.log(`Extracting fitness data from ${path.basename(zipPath)}…`);
execSync(
  `unzip -o -q "${zipPath}" "DI_CONNECT/DI-Connect-Fitness/*" -d "${root}"`,
  { stdio: 'inherit' }
);

console.log('Running import-garmin.mjs…');
execSync('node scripts/import-garmin.mjs', { cwd: root, stdio: 'inherit' });

if (args.updateTraining) {
  const activitiesPath = path.join(root, 'data', 'activities.json');
  const trainingPath = path.join(root, 'data', 'training.json');
  const payload = JSON.parse(fs.readFileSync(activitiesPath, 'utf8'));
  const existing = fs.existsSync(trainingPath)
    ? JSON.parse(fs.readFileSync(trainingPath, 'utf8'))
    : [];
  const merged = mergeTrainingFromSummary(payload.summary.byYear || [], existing);
  fs.writeFileSync(trainingPath, JSON.stringify(merged, null, 2) + '\n');
  console.log('Updated data/training.json from Garmin byYear summary');
}

console.log('Done.');
