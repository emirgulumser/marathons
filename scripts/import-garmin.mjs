/**
 * Parse Garmin DI_CONNECT summarizedActivities exports → data/activities.json
 * Usage: node scripts/import-garmin.mjs [path-to-DI_CONNECT]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { computeAllMarathonBlocks } from './activity-analytics.mjs';
import { computeRacePredictions } from '../js/race-prediction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const connectDir = process.argv[2] || path.join(root, 'DI_CONNECT', 'DI-Connect-Fitness');
const outPath = path.join(root, 'data', 'activities.json');

const RUN_TYPES = new Set([
  'running', 'indoor_running', 'trail_running', 'treadmill_running',
  'street_running', 'ultra_run',
]);

const DEVICE_NAMES = {
  // Optional manual labels: deviceId → display name
};

/** Marathon/half-distance training runs that are not races (no ? / race match). */
const NON_RACE_ACTIVITY_IDS = new Set([
  19719000657, // 2025-07-13 Copenhagen long run
]);

function parseTimeStr(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtTimeMinutes(totalMin) {
  const m = Math.round(totalMin);
  return `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, '0')}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreRaceMatch(act, race) {
  const logMinutes = parseTimeStr(race.time);
  const actMinutes = act.durationSec / 60;
  const timeDiff = Math.abs(actMinutes - logMinutes);

  let score = timeDiff;
  const raceName = race.name.toLowerCase();
  const nameLower = act.name.toLowerCase();
  const locLower = (act.location || '').toLowerCase();
  if (nameLower.includes(raceName) || locLower.includes(raceName)) score -= 40;

  if (act.lat && act.lng && race.lat && race.lng) {
    const d = haversineKm(act.lat, act.lng, race.lat, race.lng);
    if (d < 40) score -= 35;
    else if (d < 120) score -= 15;
    else score += Math.min(d / 10, 30);
  }

  return { score, timeDiff, actMinutes, logMinutes };
}

function linkActivity(act, race, kind, status) {
  const key = raceKey(race, kind);
  const { timeDiff, actMinutes } = scoreRaceMatch(act, race);
  act.raceLink = {
    kind,
    raceKey: key,
    status,
    raceName: race.name,
    raceYear: race.year,
    logTime: race.time,
    garminTime: fmtTimeMinutes(actMinutes),
    timeDiffMin: Math.round(timeDiff),
  };
  return {
    activityId: act.id,
    kind,
    matchedRaceKey: key,
    raceName: race.name,
    raceYear: race.year,
    status,
    activityDate: act.date,
    activityDistKm: act.distKm,
    garminTime: act.raceLink.garminTime,
    logTime: race.time,
    timeDiffMin: act.raceLink.timeDiffMin,
  };
}

function raceTagFor(distKm, type) {
  if (!RUN_TYPES.has(type) || distKm <= 0) return null;
  if (distKm >= 4.7 && distKm <= 5.3) return '5k';
  if (distKm >= 9.5 && distKm <= 10.5) return '10k';
  if (distKm >= 20.5 && distKm <= 22.0) return 'half';
  if (distKm >= 41.5 && distKm <= 43.5) return 'marathon';
  return null;
}

function normalize(a) {
  const durationSec = (a.duration || 0) / 1000;
  const distKm = (a.distance || 0) / 100000;
  const date = new Date(a.startTimeLocal || a.beginTimestamp);
  const type = (a.activityType || a.sportType || 'other').toLowerCase();

  let paceMinKm = null;
  if (distKm > 0.05 && durationSec > 0 && RUN_TYPES.has(type)) {
    paceMinKm = Math.round(((durationSec / 60) / distKm) * 100) / 100;
  }

  const id = a.activityId;
  const raceTag = NON_RACE_ACTIVITY_IDS.has(id) ? null : raceTagFor(distKm, type);
  return {
    id,
    name: (a.name || 'Untitled').trim(),
    type,
    date: date.toISOString().slice(0, 10),
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    distKm: Math.round(distKm * 100) / 100,
    durationSec: Math.round(durationSec),
    paceMinKm,
    elevGainM: a.elevationGain ? Math.round(a.elevationGain / 100) : null,
    avgHr: a.avgHr ?? null,
    maxHr: a.maxHr ?? null,
    calories: a.calories ? Math.round(a.calories) : null,
    location: a.locationName || null,
    lat: a.startLatitude ?? null,
    lng: a.startLongitude ?? null,
    trainingEffect: a.trainingEffectLabel || null,
    vo2Max: a.vO2MaxValue ?? null,
    avgCadence: a.avgRunCadence ?? null,
    avgPower: a.avgPower ?? null,
    deviceId: a.deviceId ?? null,
    tempMin: a.minTemperature ?? null,
    tempMax: a.maxTemperature ?? null,
    raceTag,
    garminUrl: `https://connect.garmin.com/modern/activity/${id}`,
    raceLink: null,
  };
}

function loadActivities(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter(f => f.includes('summarizedActivities'));
  if (!files.length) {
    console.error(`No summarizedActivities files in ${dir}`);
    process.exit(1);
  }

  const byId = new Map();
  for (const file of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const chunk of raw) {
      for (const a of chunk.summarizedActivitiesExport || []) {
        byId.set(a.activityId, normalize(a));
      }
    }
  }
  return [...byId.values()].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

function computeByYear(activities) {
  const map = new Map();
  for (const a of activities) {
    if (!RUN_TYPES.has(a.type)) continue;
    let row = map.get(a.year);
    if (!row) row = { year: a.year, km: 0, runs: 0, hours: 0, elevGainM: 0 };
    row.km += a.distKm;
    row.runs += 1;
    row.hours += a.durationSec / 3600;
    row.elevGainM += a.elevGainM || 0;
    map.set(a.year, row);
  }
  return [...map.values()]
    .sort((a, b) => a.year - b.year)
    .map(r => ({
      year: r.year,
      km: Math.round(r.km),
      runs: r.runs,
      hours: Math.round(r.hours),
      elevGainM: Math.round(r.elevGainM),
    }));
}

function computeByMonth(activities) {
  const map = new Map();
  for (const a of activities) {
    if (!RUN_TYPES.has(a.type)) continue;
    const key = `${a.year}-${a.month}`;
    let row = map.get(key);
    if (!row) row = { year: a.year, month: a.month, km: 0, runs: 0 };
    row.km += a.distKm;
    row.runs += 1;
    map.set(key, row);
  }
  return [...map.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map(r => ({ year: r.year, month: r.month, km: Math.round(r.km * 10) / 10, runs: r.runs }));
}

function computeByDay(activities) {
  const map = new Map();
  for (const a of activities) {
    let row = map.get(a.date);
    if (!row) row = { date: a.date, km: 0, runs: 0, count: 0 };
    row.count += 1;
    if (RUN_TYPES.has(a.type)) {
      row.km += a.distKm;
      row.runs += 1;
    }
    map.set(a.date, row);
  }
  return [...map.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(r => ({ date: r.date, km: Math.round(r.km * 10) / 10, runs: r.runs, count: r.count }));
}

function pickPr(activities, tag) {
  const candidates = activities.filter(a => a.raceTag === tag && a.paceMinKm);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.paceMinKm - b.paceMinKm || b.date.localeCompare(a.date));
  const best = candidates[0];
  return { id: best.id, date: best.date, paceMinKm: best.paceMinKm, distKm: best.distKm, name: best.name };
}

function computePrs(activities) {
  const runs = activities.filter(a => RUN_TYPES.has(a.type));
  const longest = [...runs].sort((a, b) => b.distKm - a.distKm)[0];
  const mostElev = [...runs].filter(a => a.elevGainM).sort((a, b) => b.elevGainM - a.elevGainM)[0];
  return {
    '5k': pickPr(activities, '5k'),
    '10k': pickPr(activities, '10k'),
    half: pickPr(activities, 'half'),
    marathon: pickPr(activities, 'marathon'),
    longestRun: longest ? { id: longest.id, date: longest.date, distKm: longest.distKm, name: longest.name } : null,
    mostElev: mostElev ? { id: mostElev.id, date: mostElev.date, elevGainM: mostElev.elevGainM, name: mostElev.name } : null,
  };
}

function computeDevices(activities) {
  const map = new Map();
  for (const a of activities) {
    if (!a.deviceId || !RUN_TYPES.has(a.type)) continue;
    let row = map.get(a.deviceId);
    if (!row) row = { deviceId: a.deviceId, count: 0, km: 0, label: DEVICE_NAMES[a.deviceId] || null };
    row.count += 1;
    row.km += a.distKm;
    map.set(a.deviceId, row);
  }
  return [...map.values()]
    .sort((a, b) => b.km - a.km)
    .map(r => ({ ...r, km: Math.round(r.km) }));
}

function computeGarminVsTraining(activities, trainingLog) {
  const byYear = computeByYear(activities);
  const garminMap = new Map(byYear.map(r => [r.year, r]));
  const years = new Set([...garminMap.keys(), ...trainingLog.map(t => t.year)]);
  return [...years].sort((a, b) => a - b).map(year => {
    const g = garminMap.get(year) || { km: 0, runs: 0 };
    const t = trainingLog.find(x => x.year === year) || { km: 0, runs: 0 };
    return {
      year,
      garminKm: g.km,
      logKm: t.km,
      garminRuns: g.runs,
      logRuns: t.runs,
      deltaKm: Math.round(g.km - t.km),
    };
  });
}

function raceKey(race, kind) {
  return `${kind}:${race.name}:${race.year}`;
}

function computeRaceLinks(activities, marathons, halfMarathons) {
  const raceLinks = [];
  const TIME_TOL = { marathon: 12, half: 8 };

  function processTagged(tag, kind, races) {
    const tagged = activities.filter(a => a.raceTag === tag);
    const usedRaceKeys = new Set();
    const byYear = new Map();

    for (const act of tagged) {
      if (!byYear.has(act.year)) byYear.set(act.year, []);
      byYear.get(act.year).push(act);
    }

    for (const [year, acts] of byYear) {
      const yearRaces = races.filter(r => r.year === year);
      const usedActs = new Set();
      const usedKeys = new Set();

      if (yearRaces.length) {
        const pairs = [];
        for (const act of acts) {
          for (const race of yearRaces) {
            const { score, timeDiff } = scoreRaceMatch(act, race);
            pairs.push({ act, race, score, timeDiff });
          }
        }
        pairs.sort((a, b) => a.score - b.score || a.timeDiff - b.timeDiff);

        for (const { act, race, timeDiff } of pairs) {
          const key = raceKey(race, kind);
          if (usedActs.has(act.id) || usedKeys.has(key)) continue;
          usedActs.add(act.id);
          usedKeys.add(key);
          usedRaceKeys.add(key);
          const tol = TIME_TOL[kind] ?? 10;
          const status = timeDiff <= tol ? 'matched' : 'unverified';
          raceLinks.push(linkActivity(act, race, kind, status));
        }
      }

      for (const act of acts) {
        if (usedActs.has(act.id)) continue;
        act.raceLink = { kind, status: 'unlogged', raceName: null, raceYear: year };
        raceLinks.push({
          activityId: act.id,
          kind,
          matchedRaceKey: null,
          raceName: null,
          raceYear: year,
          status: 'unlogged',
          activityDate: act.date,
          activityDistKm: act.distKm,
        });
      }
    }

    for (const race of races) {
      const key = raceKey(race, kind);
      if (usedRaceKeys.has(key)) continue;
      const hasTag = tagged.some(a => a.year === race.year);
      if (!hasTag) {
        raceLinks.push({
          activityId: null,
          kind,
          matchedRaceKey: key,
          raceName: race.name,
          raceYear: race.year,
          status: 'missing_garmin',
          activityDate: null,
          activityDistKm: null,
        });
      }
    }
  }

  processTagged('marathon', 'marathon', marathons);
  processTagged('half', 'half', halfMarathons);
  return raceLinks;
}

const activities = loadActivities(connectDir);
const marathons = JSON.parse(fs.readFileSync(path.join(root, 'data', 'marathons.json'), 'utf8'));
const halfMarathons = JSON.parse(fs.readFileSync(path.join(root, 'data', 'half-marathons.json'), 'utf8'));
const trainingLog = JSON.parse(fs.readFileSync(path.join(root, 'data', 'training.json'), 'utf8'));

let pbMin = Infinity;
marathons.forEach(r => {
  const [h, m] = r.time.split(':').map(Number);
  r.minutes = h * 60 + m;
  r.isPB = r.minutes < pbMin;
  if (r.isPB) pbMin = r.minutes;
});

const summary = {
  byYear: computeByYear(activities),
  byMonth: computeByMonth(activities),
  byDay: computeByDay(activities),
  prs: computePrs(activities),
  devices: computeDevices(activities),
  garminVsTraining: computeGarminVsTraining(activities, trainingLog),
  raceLinks: computeRaceLinks(activities, marathons, halfMarathons),
  marathonBlocks: computeAllMarathonBlocks(activities, marathons, 12),
};
summary.racePredictions = computeRacePredictions(activities, marathons, summary.marathonBlocks);

const meta = {
  source: 'Garmin Connect (DI_CONNECT)',
  importedAt: new Date().toISOString().slice(0, 10),
  count: activities.length,
};
const payload = { meta, activities, summary };

fs.writeFileSync(outPath, JSON.stringify(payload));
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Wrote ${activities.length} activities → ${outPath} (${kb} KB)`);
console.log(`Summary: ${summary.byDay.length} days, ${summary.raceLinks.length} race links, ${summary.devices.length} devices`);

const runKm = activities.filter(a => RUN_TYPES.has(a.type)).reduce((s, a) => s + a.distKm, 0);
console.log(`Running: ${activities.filter(a => RUN_TYPES.has(a.type)).length} activities, ${Math.round(runKm).toLocaleString()} km`);
