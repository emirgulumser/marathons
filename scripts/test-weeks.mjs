/**
 * Week calculation and marathon block sanity checks.
 * Usage: node scripts/test-weeks.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  kmByWeek,
  weeksOverKm,
  computeAllMarathonBlocks,
  trainingBlockExcludesRaceDay,
} from './activity-analytics.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const activities = JSON.parse(fs.readFileSync(path.join(root, 'data', 'activities.json'), 'utf8')).activities;
const marathons = JSON.parse(fs.readFileSync(path.join(root, 'data', 'marathons.json'), 'utf8'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

const vals2026 = kmByWeek(activities, 2026);
assert(vals2026[23] >= 100.5 && vals2026[23] <= 100.7, `2026 ISO W24 ≈ 100.61 km (got ${vals2026[23]})`);

const w100 = weeksOverKm(activities, 100, 2026);
assert(w100 >= 7, `2026 weeks ≥100 km count (got ${w100})`);

const blocks = computeAllMarathonBlocks(activities, marathons, 12);
assert(blocks.length >= 60, `marathon blocks computed (${blocks.length})`);

const stockholm = blocks.find(b => b.raceName === 'Stockholm' && b.raceYear === 2026);
if (stockholm) {
  assert(stockholm.window.end < stockholm.raceDate, 'block ends day before race');
  assert(stockholm.weekly.length === 12, '12 weekly slices in block');
}

const boston2018 = marathons.find(r => r.name === 'Boston' && r.year === 2018);
if (boston2018) {
  assert(trainingBlockExcludesRaceDay(activities, boston2018), 'race day excluded from Boston 2018 block');
}

const summaryBlocks = JSON.parse(fs.readFileSync(path.join(root, 'data', 'activities.json'), 'utf8')).summary?.marathonBlocks;
if (summaryBlocks?.length) {
  assert(summaryBlocks.length === blocks.length, 'import summary.marathonBlocks matches runtime count');
} else {
  console.log('SKIP: summary.marathonBlocks not in activities.json — run import-garmin.mjs');
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll week tests passed');
