/**
 * Audit race weather data and flag suspicious entries.
 * Usage: node scripts/audit-race-weather.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/activity-utils.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/race-weather.js'), 'utf8'));

const marathons = JSON.parse(fs.readFileSync(path.join(root, 'data/marathons.json'), 'utf8'));
const weather = JSON.parse(fs.readFileSync(path.join(root, 'data/race-weather.json'), 'utf8'));
const activities = JSON.parse(fs.readFileSync(path.join(root, 'data/activities.json'), 'utf8')).activities;
const overrides = JSON.parse(fs.readFileSync(path.join(root, 'data/race-activity-overrides.json'), 'utf8'));
const dateMap = RaceWeather.resolveRaceDates(activities, marathons, overrides);

const known = {
  'Boston|2018': { note: 'Infamous cold rain day', expect: 'hard' },
  'Istanbul|2016': { note: 'Mild wet ~light rain in good temps', expect: 'fair' },
  'Polar Night|2025': { note: 'Arctic winter', expect: 'hard' },
};

const rows = weather.map(w => {
  const key = `${w.race}|${w.year}`;
  const d = RaceWeather.computeDifficulty(w, w.elevGain || 0);
  const expected = RaceWeather.deriveConditions({
    rainMm: w.rainMm, snowCm: w.snowCm, weatherCode: w.weatherCode,
  });
  const flags = [];
  if (w.conditions !== expected) flags.push(`conditions: "${w.conditions}" → "${expected}"`);
  if (w.date !== dateMap.get(key)?.date) flags.push('date mismatch vs Garmin link');
  if (w.rainMm > 0.3 && !/rain|drizzle|shower|snow/i.test(w.conditions)) flags.push('rain but label dry');
  if (Math.abs((d?.score ?? 0) - (w.difficulty ?? d?.score ?? 0)) > 1) flags.push('stale difficulty score');
  const ref = known[key];
  if (ref) {
    if (ref.expect === 'hard' && d.score < 65) flags.push(`expected hard, got ${d.score}`);
    if (ref.expect === 'fair' && (d.score < 15 || d.score > 50)) flags.push(`expected ~4-5/10, got ${d.score}`);
    if (ref.expect === 'moderate' && (d.score < 35 || d.score > 60)) flags.push(`expected ~5/10, got ${d.score}`);
  }
  return { ...w, difficulty: d.score, difficultyLabel: d.label, factors: d.factors, flags };
});

const flagged = rows.filter(r => r.flags.length);
const ranked = [...rows].sort((a, b) => b.difficulty - a.difficulty);

console.log(`Audited ${rows.length} races · ${flagged.length} flagged\n`);
if (flagged.length) {
  console.log('=== FLAGGED ===');
  for (const r of flagged) {
    console.log(`${r.race} ${r.year} (${r.date}) — ${r.flags.join('; ')}`);
    console.log(`  ${r.tempMin ?? r.tempC}–${r.tempMax ?? r.tempC}°C · ${r.conditions} · ${r.rainMm}mm · ${r.windKph}km/h → ${r.difficulty} ${r.difficultyLabel}`);
  }
  console.log('');
}

console.log('=== TOP 10 HARDEST ===');
ranked.slice(0, 10).forEach(r => {
  const f = r.factors?.map(x => `${x.label}+${x.value}`).join(', ') || '—';
  console.log(`${r.race} ${r.year}: ${r.difficulty} ${r.difficultyLabel} | ${r.tempMin ?? r.tempC}–${r.tempMax ?? r.tempC}°C ${r.conditions} ${r.rainMm}mm ${r.windKph}km/h | ${f}`);
});

console.log('\n=== REFERENCE RACES ===');
for (const [key, ref] of Object.entries(known)) {
  const r = rows.find(x => `${x.race}|${x.year}` === key);
  if (r) console.log(`${r.race} ${r.year}: ${r.difficulty} ${r.difficultyLabel} (${ref.note})`);
}

process.exit(flagged.length ? 1 : 0);
