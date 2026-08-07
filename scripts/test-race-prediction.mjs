/**
 * Race prediction sanity checks.
 * Usage: node scripts/test-race-prediction.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  predictAsOf,
  computeRacePredictions,
  riegelMinutes,
  vo2ToMarathonMinutes,
  backtestStats,
  daysBetween,
} from '../js/race-prediction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data', 'activities.json');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('Race prediction tests\n');

// VO2 58 (Garmin) → ~3:00 marathon after Daniels table + Garmin offset
const vo2Mar = vo2ToMarathonMinutes(58);
assert(vo2Mar >= 178 && vo2Mar <= 186, `Garmin VO₂ 58 → marathon ${vo2Mar.toFixed(1)} min (expect ~3:00)`);
const riegelMar = riegelMinutes(10, 40, 42.195);
assert(riegelMar >= 178 && riegelMar <= 186, `Riegel 10K 40:00 → marathon ${riegelMar.toFixed(1)} min (expect 178–186)`);

if (!fs.existsSync(dataPath)) {
  console.log('\nSkipping data tests — activities.json not found. Run import first.');
  process.exit(failed ? 1 : 0);
}

const payload = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const { activities, summary } = payload;
const blocks = summary.marathonBlocks || [];
const marathons = JSON.parse(fs.readFileSync(path.join(root, 'data', 'marathons.json'), 'utf8'));

if (!summary.racePredictions) {
  console.log('\nNo summary.racePredictions — run: node scripts/import-garmin.mjs');
  process.exit(1);
}

const rp = summary.racePredictions;
assert(rp.current?.marathon?.minutes != null, 'current marathon prediction exists');
assert(rp.timeline?.length > 12, `timeline has ${rp.timeline?.length || 0} monthly points`);
assert(rp.backtest?.length >= 50, `backtest has ${rp.backtest?.length || 0} rows (expect ≥50)`);

for (const row of rp.backtest) {
  assert(row.predictDate < row.raceDate, `no leakage: ${row.key} predict ${row.predictDate} < race ${row.raceDate}`);
}

const stats = backtestStats(rp.backtest);
assert(stats.mae != null && stats.mae < 45, `backtest MAE ${stats.mae} min (expect <45)`);
console.log(`  MAE ${stats.mae} min · within ±5 min: ${stats.within5}% · within ±10 min: ${stats.within10}%`);

// Historical predictAsOf matches import backtest for a sample row
const sample = rp.backtest.find(b => b.predictedMinutes != null);
if (sample) {
  const live = predictAsOf(activities, blocks, marathons, sample.predictDate);
  const diff = Math.abs((live.marathon.minutes || 0) - sample.predictedMinutes);
  assert(diff < 0.2, `live predictAsOf matches backtest for ${sample.key} (Δ ${diff.toFixed(2)} min)`);
}

// Upcoming race window helper
const withRace = blocks.find(b => b.raceDate > rp.minDate);
if (withRace) {
  const predictDate = withRace.raceDate.slice(0, 8) + String(Number(withRace.raceDate.slice(8)) - 3).padStart(2, '0');
  if (daysBetween(predictDate, withRace.raceDate) <= 21) {
    const pred = predictAsOf(activities, blocks, marathons, predictDate);
    assert(pred.marathon.minutes != null, `historical prediction on ${predictDate} before ${withRace.raceName}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
