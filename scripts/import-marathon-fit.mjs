/**
 * Parse Garmin FIT / ZIP activity exports → marathon tracks + chart details.
 *
 * Drop files as:
 *   data/fits/marathons/23816379030.zip
 *   data/fits/marathons/activity_23816379030.fit
 *   data/23816379030.zip  (also scanned)
 *
 * Usage: node scripts/import-marathon-fit.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import FitParser from 'fit-file-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const fitDir = path.join(root, 'data', 'fits', 'marathons');
const dataDir = path.join(root, 'data');
const activitiesPath = path.join(root, 'data', 'activities.json');
const marathonsPath = path.join(root, 'data', 'marathons.json');
const outPath = path.join(root, 'data', 'marathon-tracks.json');
const detailsDir = path.join(root, 'data', 'activity-details');

function raceKey(race) {
  return `marathon:${race.name}:${race.year}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function activityIdFromName(file) {
  const m = file.match(/(?:activity_)?(\d+)(?:_ACTIVITY)?\.(?:zip|fit)$/i);
  return m ? Number(m[1]) : null;
}

function readFitBuffer(filePath) {
  if (filePath.toLowerCase().endsWith('.fit')) return fs.readFileSync(filePath);
  if (filePath.toLowerCase().endsWith('.zip')) {
    const tmpDir = fs.mkdtempSync(path.join(root, '.fit-tmp-'));
    try {
      execFileSync('unzip', ['-o', '-q', filePath, '-d', tmpDir], { maxBuffer: 20 * 1024 * 1024 });
      const walk = (dir) => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          if (fs.statSync(full).isDirectory()) {
            const found = walk(full);
            if (found) return found;
          } else if (/\.fit$/i.test(name)) return full;
        }
        return null;
      };
      const fitPath = walk(tmpDir);
      if (!fitPath) throw new Error(`No .fit inside ${path.basename(filePath)}`);
      return fs.readFileSync(fitPath);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  throw new Error(`Unsupported file: ${filePath}`);
}

function parseFit(buf) {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'm/s',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
    });
    parser.parse(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function downsample(points, minDistM = 30, maxPoints = 700) {
  if (points.length <= 2) return points;
  const minDistKm = minDistM / 1000;
  const kept = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    if (haversineKm(last[0], last[1], p[0], p[1]) >= minDistKm) {
      kept.push(p);
      last = p;
    }
  }
  const end = points[points.length - 1];
  if (kept[kept.length - 1] !== end) kept.push(end);
  if (kept.length <= maxPoints) return kept;
  const step = Math.ceil((kept.length - 2) / (maxPoints - 2));
  const sparse = [kept[0]];
  for (let i = step; i < kept.length - 1; i += step) sparse.push(kept[i]);
  sparse.push(kept[kept.length - 1]);
  return sparse;
}

function smoothSeries(values, window = 9) {
  const out = values.slice();
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (values[j] == null) continue;
      sum += values[j];
      n += 1;
    }
    if (n) out[i] = sum / n;
  }
  return out;
}

function matchRace(meta, marathons) {
  if (!meta.year) return null;
  const candidates = marathons.filter(r => r.year === meta.year);
  if (!candidates.length) return null;

  if (Number.isFinite(meta.lat) && Number.isFinite(meta.lng)) {
    let best = null;
    let bestKm = Infinity;
    for (const r of candidates) {
      if (r.lat == null || r.lng == null) continue;
      const km = haversineKm(meta.lat, meta.lng, r.lat, r.lng);
      if (km < bestKm) { bestKm = km; best = r; }
    }
    if (best && bestKm <= 80) return best;
  }
  return null;
}

function buildFromFit(data, activityId) {
  const session = data.sessions?.[0] || {};
  const records = (data.records || []).filter(r =>
    Number.isFinite(r.position_lat) && Number.isFinite(r.position_long));
  if (records.length < 2) throw new Error('FIT has fewer than 2 GPS records');

  const t0 = new Date(records[0].timestamp).getTime();
  const built = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const t = new Date(r.timestamp).getTime();
    const distKm = (r.distance ?? 0) / 1000;
    let pace = null;
    if (i > 0) {
      const dKm = distKm - (records[i - 1].distance ?? 0) / 1000;
      const dtMin = (t - new Date(records[i - 1].timestamp).getTime()) / 60000;
      if (dKm > 0.0005 && dtMin > 0) {
        pace = dtMin / dKm;
        if (pace < 2.5 || pace > 15) pace = null;
      }
    }
    const cadRaw = r.cadence;
    const cad = cadRaw != null ? (cadRaw < 120 ? cadRaw * 2 : cadRaw) : null;
    built.push({
      elapsedSec: (t - t0) / 1000,
      distKm: Math.round(distKm * 1000) / 1000,
      ele: r.enhanced_altitude ?? r.altitude ?? null,
      pace,
      hr: r.heart_rate ?? null,
      cad,
      gct: r.stance_time ?? r.ground_contact_time ?? null,
      vo: r.vertical_oscillation != null ? r.vertical_oscillation / 10 : null, // mm → cm
      power: r.power ?? null,
      temp: r.temperature ?? null,
      stride: r.step_length != null ? r.step_length / 10 : null, // mm → cm
      lat: r.position_lat,
      lng: r.position_long,
    });
  }

  const paces = smoothSeries(built.map(p => p.pace), 9);
  built.forEach((p, i) => { p.pace = paces[i]; });

  let series = built;
  const maxPoints = 700;
  if (series.length > maxPoints) {
    const step = Math.ceil(series.length / maxPoints);
    series = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  }

  const avg = (key, src = series) => {
    const vals = src.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };
  const max = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    return vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null;
  };
  const min = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    return vals.length ? Math.round(Math.min(...vals) * 10) / 10 : null;
  };

  const mapPoints = downsample(records.map(r => {
    const ele = r.enhanced_altitude ?? r.altitude;
    return Number.isFinite(ele)
      ? [r.position_lat, r.position_long, ele]
      : [r.position_lat, r.position_long];
  }));

  const start = new Date(session.start_time || records[0].timestamp || data.activity?.local_timestamp);
  const local = data.activity?.local_timestamp
    ? new Date(data.activity.local_timestamp)
    : start;
  const date = local.toISOString().slice(0, 10);
  const year = Number(date.slice(0, 4));

  const distKm = Math.round(((session.total_distance ?? records[records.length - 1].distance) / 1000) * 100) / 100;
  const durationSec = Math.round(session.total_timer_time ?? session.total_elapsed_time ?? built[built.length - 1].elapsedSec);
  const avgCadSession = session.avg_cadence != null
    ? (session.avg_cadence < 120 ? session.avg_cadence * 2 : session.avg_cadence)
    : avg('cad');

  const summary = {
    distKm,
    durationSec,
    elevGainM: session.total_ascent != null ? Math.round(session.total_ascent) : null,
    elevLossM: session.total_descent != null ? Math.round(session.total_descent) : null,
    minElev: min('ele'),
    maxElev: max('ele'),
    avgPace: durationSec && distKm ? Math.round(((durationSec / 60) / distKm) * 100) / 100 : avg('pace'),
    avgHr: session.avg_heart_rate ?? avg('hr'),
    maxHr: session.max_heart_rate ?? max('hr'),
    avgCad: avgCadSession,
    avgGct: session.avg_stance_time ?? avg('gct'),
    avgVo: session.avg_vertical_oscillation != null
      ? Math.round((session.avg_vertical_oscillation / 10) * 10) / 10
      : avg('vo'),
    avgPower: session.avg_power ?? avg('power'),
    avgStrideLength: session.avg_step_length != null
      ? Math.round(session.avg_step_length / 10)
      : (avg('stride') != null ? Math.round(avg('stride')) : null),
    calories: session.total_calories ?? null,
    avgTemp: avg('temp'),
  };

  return {
    activityId,
    date,
    year,
    lat: session.start_position_lat ?? records[0].position_lat,
    lng: session.start_position_long ?? records[0].position_long,
    mapPoints,
    pointCount: records.length,
    simplifiedCount: mapPoints.length,
    series,
    summary,
  };
}

function loadExistingTracks() {
  if (!fs.existsSync(outPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(outPath, 'utf8')).tracks || {};
  } catch {
    return {};
  }
}

function collectInputFiles() {
  const files = [];
  if (fs.existsSync(fitDir)) {
    for (const f of fs.readdirSync(fitDir)) {
      if (/\.(zip|fit)$/i.test(f)) files.push(path.join(fitDir, f));
    }
  }
  if (fs.existsSync(dataDir)) {
    for (const f of fs.readdirSync(dataDir)) {
      if (/^\d+\.zip$/i.test(f) || /^activity_\d+\.(zip|fit)$/i.test(f)) {
        files.push(path.join(dataDir, f));
      }
    }
  }
  return [...new Map(files.map(f => [path.basename(f), f])).values()];
}

async function main() {
  fs.mkdirSync(fitDir, { recursive: true });
  fs.mkdirSync(detailsDir, { recursive: true });

  const inputs = collectInputFiles();
  if (!inputs.length) {
    console.error('No FIT/ZIP files found.');
    console.error(`Put exports in ${fitDir} as {activityId}.zip or activity_{id}.fit`);
    process.exit(1);
  }

  const activities = fs.existsSync(activitiesPath)
    ? JSON.parse(fs.readFileSync(activitiesPath, 'utf8')).activities || []
    : [];
  const marathons = JSON.parse(fs.readFileSync(marathonsPath, 'utf8'));
  const byId = new Map(activities.map(a => [a.id, a]));
  const tracks = loadExistingTracks();

  let updated = 0;
  for (const filePath of inputs) {
    const base = path.basename(filePath);
    const activityId = activityIdFromName(base);
    if (!activityId) {
      console.warn(`Skip ${base} — name as {id}.zip or activity_{id}.fit`);
      continue;
    }

    process.stdout.write(`Parsing ${base}… `);
    let parsed;
    try {
      const buf = readFitBuffer(filePath);
      const fit = await parseFit(buf);
      parsed = buildFromFit(fit, activityId);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      continue;
    }

    const act = byId.get(activityId);
    let key = null;
    let raceName = null;
    let raceYear = null;
    let via = '';

    if (act?.raceLink?.kind === 'marathon' && act.raceLink.raceKey) {
      key = act.raceLink.raceKey;
      raceName = act.raceLink.raceName;
      raceYear = act.raceLink.raceYear;
      via = 'activity';
    } else {
      const race = matchRace(parsed, marathons);
      if (!race) {
        console.log(`skip — no marathon match for ${activityId} (${parsed.date})`);
        continue;
      }
      key = raceKey(race);
      raceName = race.name;
      raceYear = race.year;
      via = act ? 'fit+activity fallback' : 'fit geo match';
    }

    // Prefer keeping exports under data/fits/marathons/
    const preferredSource = /\.fit$/i.test(base) ? `${activityId}.fit` : `${activityId}.zip`;
    const destPath = path.join(fitDir, preferredSource);
    if (path.resolve(filePath) !== path.resolve(destPath)) {
      fs.copyFileSync(filePath, destPath);
    }

    tracks[key] = {
      activityId,
      raceKey: key,
      raceName,
      raceYear,
      date: act?.date || parsed.date,
      distKm: act?.distKm ?? parsed.summary.distKm,
      trackKm: parsed.summary.distKm,
      sourceFile: preferredSource,
      sourceFormat: 'fit',
      pointCount: parsed.pointCount,
      simplifiedCount: parsed.simplifiedCount,
      elevGainM: parsed.summary.elevGainM,
      elevLossM: parsed.summary.elevLossM,
      minElev: parsed.summary.minElev,
      maxElev: parsed.summary.maxElev,
      points: parsed.mapPoints,
    };

    const detailPath = path.join(detailsDir, `${activityId}.json`);
    fs.writeFileSync(detailPath, `${JSON.stringify({
      activityId,
      raceKey: key,
      raceName,
      raceYear,
      date: act?.date || parsed.date,
      sourceFile: preferredSource,
      sourceFormat: 'fit',
      series: parsed.series,
      summary: {
        ...parsed.summary,
        avgHr: act?.avgHr ?? parsed.summary.avgHr,
        maxHr: act?.maxHr ?? parsed.summary.maxHr,
        avgCadence: act?.avgCadence ?? parsed.summary.avgCad,
        avgPower: act?.avgPower ?? parsed.summary.avgPower,
        avgGct: act?.avgGct ?? parsed.summary.avgGct,
        avgVerticalOsc: act?.avgVerticalOsc ?? parsed.summary.avgVo,
        avgStrideLength: act?.avgStrideLength ?? parsed.summary.avgStrideLength,
        calories: act?.calories ?? parsed.summary.calories,
        elevGainM: act?.elevGainM ?? parsed.summary.elevGainM,
        elevLossM: act?.elevLossM ?? parsed.summary.elevLossM,
      },
    })}\n`);

    updated += 1;
    console.log(`✓ ${key} · ${parsed.summary.distKm} km · HR ${parsed.summary.avgHr} · GCT ${parsed.summary.avgGct} ms · ${via}`);
  }

  fs.writeFileSync(outPath, JSON.stringify({
    meta: {
      importedAt: new Date().toISOString().slice(0, 10),
      count: Object.keys(tracks).length,
      fitDir: 'data/fits/marathons',
    },
    tracks,
  }));
  console.log(`\nWrote ${outPath} (${Object.keys(tracks).length} tracks, ${updated} updated)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
