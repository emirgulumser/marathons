/**
 * Verify marathon finish-time bucket math (distribution chart).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const BIN = 5;
const races = JSON.parse(fs.readFileSync(path.join(root, 'data', 'marathons.json'), 'utf8'));

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(m) {
  const rounded = Math.round(m);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

function buildTimeBuckets(raceList, bin = 5) {
  const times = raceList.map(r => parseTime(r.time)).sort((a, b) => a - b);
  const lo = Math.floor(Math.min(...times) / bin) * bin;
  const hi = Math.ceil((Math.max(...times) + 0.001) / bin) * bin;
  const buckets = [];
  for (let min = lo; min < hi; min += bin) {
    buckets.push({ min, max: min + bin, label: `${fmtTime(min)}–${fmtTime(min + bin - 1)}` });
  }
  const racesByBin = buckets.map(b =>
    raceList.filter(r => {
      const m = parseTime(r.time);
      return m >= b.min && m < b.max;
    })
  );
  const counts = racesByBin.map(list => list.length);
  const mid = Math.floor(times.length / 2);
  const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return { buckets, counts, racesByBin, median, times };
}

function minutesToBucketX(buckets, minutes) {
  if (!buckets.length) return 0;
  const lo = buckets[0].min;
  const hi = buckets[buckets.length - 1].max;
  if (minutes <= lo) return 0;
  if (minutes >= hi) return buckets.length - 1;
  for (let i = 0; i < buckets.length - 1; i++) {
    const b = buckets[i];
    const next = buckets[i + 1];
    if (minutes >= b.min && minutes < next.min) {
      const span = next.min - b.min || 5;
      return i + (minutes - b.min) / span;
    }
  }
  return buckets.length - 1;
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

const built = buildTimeBuckets(races);
assert(built.times.length === races.length, `all ${races.length} races in bucket input`);
assert(built.counts.reduce((a, b) => a + b, 0) === races.length, 'bucket counts sum to race count');
assert(built.buckets.every(b => b.label.includes('–')), 'bucket labels are ranges');

const medianX = minutesToBucketX(built.buckets, built.median);
assert(medianX >= 0 && medianX <= built.buckets.length - 1, `median x in range (${medianX.toFixed(2)})`);

const emptyBins = built.counts.filter(n => n === 0).length;
console.log(`Bins: ${built.buckets.length}, empty: ${emptyBins}, median: ${fmtTime(built.median)} @ x=${medianX.toFixed(2)}`);

if (failed) {
  process.exit(1);
}
console.log('All marathon chart checks passed.');
