/**
 * Fetch historical race-day weather from Open-Meteo and write data/race-weather.json.
 * Weather is sampled only during the race window (Garmin start → finish, or 09:00 + duration).
 *
 * Usage:
 *   node scripts/fetch-race-weather.mjs
 *   node scripts/fetch-race-weather.mjs --force
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadBrowserUtil(filename) {
  global.window = global;
  vm.runInThisContext(fs.readFileSync(path.join(root, filename), 'utf8'), { filename });
}

loadBrowserUtil('js/utils.js');
loadBrowserUtil('js/activity-utils.js');
loadBrowserUtil('js/race-weather.js');

const force = process.argv.includes('--force');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const onlyRace = onlyArg ? onlyArg.slice('--only='.length) : null;
const marathonsAll = JSON.parse(fs.readFileSync(path.join(root, 'data/marathons.json'), 'utf8'));
const marathons = onlyRace
  ? marathonsAll.filter(r => `${r.name}|${r.year}` === onlyRace || r.name === onlyRace)
  : marathonsAll;
if (onlyRace && !marathons.length) {
  console.error(`No marathon matched --only=${onlyRace}`);
  process.exit(1);
}
const activities = fs.existsSync(path.join(root, 'data/activities.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'data/activities.json'), 'utf8')).activities
  : [];
const overrides = fs.existsSync(path.join(root, 'data/race-activity-overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'data/race-activity-overrides.json'), 'utf8'))
  : [];

const dateMap = RaceWeather.resolveRaceDates(activities, marathons, overrides);
const startTimes = JSON.parse(fs.readFileSync(path.join(root, 'data/race-start-times.json'), 'utf8'));
const weatherOverrides = fs.existsSync(path.join(root, 'data/race-weather-overrides.json'))
  ? JSON.parse(fs.readFileSync(path.join(root, 'data/race-weather-overrides.json'), 'utf8'))
  : {};

function entryComplete(entry) {
  return entry
    && entry.date
    && entry.windowStart
    && entry.rainMm != null
    && entry.snowCm != null
    && entry.windKph != null
    && entry.humidity != null
    && entry.conditions
    && entry.difficulty != null;
}

async function fetchRaceWeather(race, meta) {
  const date = meta.date;
  const params = new URLSearchParams({
    latitude: String(race.lat),
    longitude: String(race.lng),
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m,relative_humidity_2m,windspeed_10m,precipitation,rain,snowfall,weathercode',
    timezone: 'auto',
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${race.name} ${race.year}: HTTP ${res.status}`);
  const data = await res.json();

  const times = data.hourly?.time || [];
  const hourly = {
    temperature_2m: data.hourly?.temperature_2m || [],
    relative_humidity_2m: data.hourly?.relative_humidity_2m || [],
    windspeed_10m: data.hourly?.windspeed_10m || [],
    precipitation: data.hourly?.precipitation || [],
    rain: data.hourly?.rain || [],
    snowfall: data.hourly?.snowfall || [],
    weathercode: data.hourly?.weathercode || [],
  };

  const window = RaceWeather.raceWindowMinutes(meta, data.timezone, race, startTimes);
  const pick = RaceWeather.windowIndices(times, window.startMin, window.endMin);
  const agg = RaceWeather.aggregateHourlyWindow(hourly, pick.length ? pick : times.map((_, i) => i));

  const conditions = RaceWeather.deriveConditions({
    rainMm: agg.rainMm,
    snowCm: agg.snowCm,
    weatherCode: agg.weatherCode,
    codesInWindow: agg.codesInWindow,
  });
  const elevGain = meta.elevGain || 0;
  const weather = RaceWeather.applyWeatherOverrides({
    tempC: agg.tempC != null ? Math.round(agg.tempC * 10) / 10 : null,
    tempMin: agg.tempMin != null ? Math.round(agg.tempMin * 10) / 10 : null,
    tempMax: agg.tempMax != null ? Math.round(agg.tempMax * 10) / 10 : null,
    humidity: agg.humidity != null ? Math.round(agg.humidity) : null,
    windKph: agg.windKph != null ? Math.round(agg.windKph * 10) / 10 : null,
    windMaxKph: agg.windMaxKph != null ? Math.round(agg.windMaxKph * 10) / 10 : null,
    rainMm: Math.round(agg.rainMm * 10) / 10,
    snowCm: Math.round(agg.snowCm * 10) / 10,
    precipMm: Math.round(agg.precipMm * 10) / 10,
    weatherCode: agg.weatherCode,
    conditions,
  }, race.name, race.year, weatherOverrides);
  const difficulty = RaceWeather.computeDifficulty(weather, elevGain);

  return {
    race: race.name,
    year: race.year,
    date,
    ...weather,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    windowSource: window.source,
    windowNote: window.note || null,
    weatherNote: weather.weatherNote || null,
    hoursSampled: agg.hoursSampled,
    elevGain,
    difficulty: difficulty?.score ?? null,
    difficultyLabel: difficulty?.label ?? null,
  };
}

async function main() {
  const outPath = path.join(root, 'data/race-weather.json');
  const existing = fs.existsSync(outPath)
    ? new Map(JSON.parse(fs.readFileSync(outPath, 'utf8')).map(w => [`${w.race}|${w.year}`, w]))
    : new Map();

  const withStartTime = [...dateMap.values()].filter(m => m.startTime).length;
  if (!withStartTime) {
    console.log('Using official start times from data/race-start-times.json (+ wave estimates for majors).');
    console.log('Re-import Garmin data for exact per-runner start: node scripts/import-garmin-activities.mjs\n');
  }

  const results = onlyRace
    ? [...existing.values()].filter(w => !marathons.some(r => r.name === w.race && r.year === w.year))
    : [];
  let fetched = 0;

  for (const race of marathons) {
    const key = `${race.name}|${race.year}`;
    let meta = dateMap.get(key);
    // Allow explicit date when Garmin activity is not imported yet (e.g. recent night races).
    const dateOverride = startTimes.overrides?.[key]?.date;
    if (!meta?.date && dateOverride) {
      const officialSec = race.time ? parseTime(race.time) * 60 : 4 * 3600;
      meta = { date: dateOverride, elevGain: 0, startTime: null, durationSec: officialSec };
    }
    if (!meta?.date) {
      console.warn(`Skip ${key}: no race date`);
      continue;
    }
    const cached = existing.get(key);
    if (!force && cached && cached.date === meta.date && entryComplete(cached)) {
      const difficulty = RaceWeather.computeDifficulty(cached, cached.elevGain || 0);
      results.push({
        ...cached,
        conditions: RaceWeather.deriveConditions({
          rainMm: cached.rainMm,
          snowCm: cached.snowCm,
          weatherCode: cached.weatherCode,
        }),
        difficulty: difficulty?.score ?? cached.difficulty,
        difficultyLabel: difficulty?.label ?? cached.difficultyLabel,
      });
      continue;
    }

    process.stdout.write(`Fetching ${race.name} ${race.year} (${meta.date})… `);
    try {
      const entry = await fetchRaceWeather(race, meta);
      results.push(entry);
      fetched++;
      const extra = [`${entry.windowStart}–${entry.windowEnd}`, entry.conditions];
      if (entry.rainMm > 0) extra.push(`${entry.rainMm}mm rain`);
      if (entry.snowCm > 0) extra.push(`${entry.snowCm}cm snow`);
      extra.push(`${entry.tempMin}–${entry.tempMax}°C`, `${entry.windKph}km/h`, `diff ${entry.difficulty}`);
      console.log(extra.join(' · '));
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      if (cached) results.push(cached);
    }
    await new Promise(r => setTimeout(r, 120));
  }

  results.sort((a, b) => a.year - b.year || a.race.localeCompare(b.race));
  fs.writeFileSync(outPath, `${JSON.stringify(results, null, 2)}\n`);
  console.log(`\nWrote ${results.length} entries to data/race-weather.json (${fetched} fetched)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
