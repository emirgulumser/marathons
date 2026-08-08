/**
 * Parse marathon GPX files → data/marathon-tracks.json
 *
 * Drop files as: data/gpx/marathons/activity_{garminActivityId}.gpx
 * Usage: node scripts/import-marathon-gpx.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const gpxDir = path.join(root, 'data', 'gpx', 'marathons');
const activitiesPath = path.join(root, 'data', 'activities.json');
const marathonsPath = path.join(root, 'data', 'marathons.json');
const outPath = path.join(root, 'data', 'marathon-tracks.json');

function raceKey(race) {
  return `marathon:${race.name}:${race.year}`;
}

function gpxMeta(xml) {
  const name = xml.match(/<name>([^<]+)<\/name>/)?.[1]?.trim() || '';
  const times = [...xml.matchAll(/<time>([^<]+)<\/time>/g)].map(m => m[1]);
  const date = times[0] ? times[0].slice(0, 10) : null;
  const year = date ? Number(date.slice(0, 4)) : null;
  const firstPt = xml.match(/<trkpt lat="([^"]+)" lon="([^"]+)"/);
  const lat = firstPt ? parseFloat(firstPt[1]) : null;
  const lng = firstPt ? parseFloat(firstPt[2]) : null;
  return { name, date, year, lat, lng };
}

function matchRaceFromGpx(meta, marathons) {
  if (!meta.year) return null;
  const candidates = marathons.filter(r => r.year === meta.year);
  if (!candidates.length) return null;

  const nameTok = meta.name.toLowerCase().replace(/\s+running$/i, '').trim();
  const byName = candidates.find(r => {
    const rn = r.name.toLowerCase();
    return rn === nameTok || rn.includes(nameTok) || nameTok.includes(rn.split(' ')[0]);
  });
  if (byName) return byName;

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseGpxPoints(xml) {
  const points = [];
  const re = /<trkpt lat="([^"]+)" lon="([^"]+)"[^>]*>\s*(?:<ele>([^<]*)<\/ele>)?/g;
  let m;
  while ((m = re.exec(xml)) != null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    const ele = m[3] != null && m[3] !== '' ? parseFloat(m[3]) : null;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      points.push(ele != null && Number.isFinite(ele) ? [lat, lng, ele] : [lat, lng]);
    }
  }
  return points;
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

function trackDistanceKm(points) {
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    km += haversineKm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
  }
  return Math.round(km * 100) / 100;
}

function elevStats(points) {
  let gain = 0;
  let loss = 0;
  let min = null;
  let max = null;
  for (let i = 0; i < points.length; i++) {
    const ele = points[i][2];
    if (!Number.isFinite(ele)) continue;
    if (min == null || ele < min) min = ele;
    if (max == null || ele > max) max = ele;
    if (i > 0 && Number.isFinite(points[i - 1][2])) {
      const d = ele - points[i - 1][2];
      if (d > 0.5) gain += d;
      else if (d < -0.5) loss += -d;
    }
  }
  return {
    elevGainM: Math.round(gain),
    elevLossM: Math.round(loss),
    minElev: min != null ? Math.round(min) : null,
    maxElev: max != null ? Math.round(max) : null,
  };
}

/** Downsampled chart series for activity.html (HR/pace/cad/GCT when present in GPX). */
function parseGpxDetailSeries(xml, maxPoints = 700) {
  const raw = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let m;
  const num = (block, patterns) => {
    for (const p of patterns) {
      const mm = block.match(p);
      if (mm && mm[1] !== '') {
        const v = parseFloat(mm[1]);
        if (Number.isFinite(v)) return v;
      }
    }
    return null;
  };
  while ((m = re.exec(xml)) != null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const block = m[3];
    const timeM = block.match(/<time>([^<]*)<\/time>/i);
    const t = timeM ? Date.parse(timeM[1]) : NaN;
    raw.push({
      lat, lng,
      ele: num(block, [/<ele>([^<]*)<\/ele>/i]),
      t: Number.isFinite(t) ? t : null,
      hr: num(block, [/<(?:[\w.]+:)?hr>([^<]*)<\/(?:[\w.]+:)?hr>/i]),
      cad: num(block, [/<(?:[\w.]+:)?cad>([^<]*)<\/(?:[\w.]+:)?cad>/i]),
      gct: num(block, [/<(?:[\w.]+:)?groundcontacttime>([^<]*)<\/(?:[\w.]+:)?groundcontacttime>/i]),
      vo: num(block, [/<(?:[\w.]+:)?verticaloscillation>([^<]*)<\/(?:[\w.]+:)?verticaloscillation>/i]),
      power: num(block, [/<(?:[\w.]+:)?power>([^<]*)<\/(?:[\w.]+:)?power>/i]),
      temp: num(block, [/<(?:[\w.]+:)?atemp>([^<]*)<\/(?:[\w.]+:)?atemp>/i]),
    });
  }
  if (raw.length < 2) return null;

  const t0 = raw.find(p => p.t != null)?.t ?? 0;
  let distKm = 0;
  let elevGain = 0;
  let elevLoss = 0;
  const built = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) {
      distKm += haversineKm(raw[i - 1].lat, raw[i - 1].lng, p.lat, p.lng);
      if (p.ele != null && raw[i - 1].ele != null) {
        const d = p.ele - raw[i - 1].ele;
        if (d > 0.5) elevGain += d;
        else if (d < -0.5) elevLoss += -d;
      }
    }
    let pace = null;
    if (i > 0 && p.t != null && raw[i - 1].t != null) {
      const dKm = haversineKm(raw[i - 1].lat, raw[i - 1].lng, p.lat, p.lng);
      const dtMin = (p.t - raw[i - 1].t) / 60000;
      if (dKm > 0.0005 && dtMin > 0) {
        pace = dtMin / dKm;
        if (pace < 2.5 || pace > 15) pace = null;
      }
    }
    built.push({
      elapsedSec: p.t != null ? (p.t - t0) / 1000 : i,
      distKm: Math.round(distKm * 1000) / 1000,
      ele: p.ele,
      pace,
      hr: p.hr,
      cad: p.cad != null ? (p.cad < 120 ? p.cad * 2 : p.cad) : null,
      gct: p.gct,
      vo: p.vo,
      power: p.power,
      temp: p.temp,
      lat: p.lat,
      lng: p.lng,
    });
  }

  let series = built;
  if (series.length > maxPoints) {
    const step = Math.ceil(series.length / maxPoints);
    series = series.filter((_, i) => i % step === 0 || i === series.length - 1);
  }

  const avg = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null);
    if (!vals.length) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };
  const max = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null);
    return vals.length ? Math.round(Math.max(...vals) * 10) / 10 : null;
  };
  const min = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null);
    return vals.length ? Math.round(Math.min(...vals) * 10) / 10 : null;
  };

  return {
    series,
    summary: {
      distKm: series[series.length - 1]?.distKm ?? 0,
      durationSec: Math.round(series[series.length - 1]?.elapsedSec ?? 0),
      elevGainM: Math.round(elevGain),
      elevLossM: Math.round(elevLoss),
      minElev: min('ele'),
      maxElev: max('ele'),
      avgPace: avg('pace'),
      avgHr: avg('hr'),
      maxHr: max('hr'),
      avgCad: avg('cad'),
      avgGct: avg('gct'),
      avgVo: avg('vo'),
      avgPower: avg('power'),
      avgTemp: avg('temp'),
    },
  };
}

function writeActivityDetails(activityId, detail) {
  const dir = path.join(root, 'data', 'activity-details');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${activityId}.json`);
  fs.writeFileSync(out, `${JSON.stringify(detail)}\n`);
  return out;
}

function loadExistingTracks() {
  if (!fs.existsSync(outPath)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    return data.tracks || {};
  } catch {
    return {};
  }
}

function main() {
  if (!fs.existsSync(gpxDir)) {
    console.error(`GPX folder not found: ${gpxDir}`);
    console.error('Export GPX from Garmin Connect → data/gpx/marathons/activity_{id}.gpx');
    process.exit(1);
  }

  const activities = fs.existsSync(activitiesPath)
    ? JSON.parse(fs.readFileSync(activitiesPath, 'utf8')).activities || []
    : [];
  const marathons = JSON.parse(fs.readFileSync(marathonsPath, 'utf8'));
  const byId = new Map(activities.map(a => [a.id, a]));
  const tracks = loadExistingTracks();
  const files = fs.readdirSync(gpxDir).filter(f => f.endsWith('.gpx'));

  if (!files.length) {
    console.error(`No .gpx files in ${gpxDir}`);
    process.exit(1);
  }

  let added = 0;
  for (const file of files) {
    const idMatch = file.match(/activity_(\d+)\.gpx$/i) || file.match(/^(\d+)\.gpx$/);
    if (!idMatch) {
      console.warn(`Skip ${file} — name as activity_{id}.gpx`);
      continue;
    }
    const activityId = Number(idMatch[1]);
    const act = byId.get(activityId);

    const raw = fs.readFileSync(path.join(gpxDir, file), 'utf8');
    const allPoints = parseGpxPoints(raw);
    if (allPoints.length < 2) {
      console.warn(`Skip ${file} — fewer than 2 track points`);
      continue;
    }

    let key = null;
    let raceName = null;
    let raceYear = null;
    let date = null;
    let distKm = null;
    let via = '';

    if (act?.raceLink?.kind === 'marathon' && act.raceLink.raceKey && act.raceLink.raceName) {
      key = act.raceLink.raceKey;
      raceName = act.raceLink.raceName;
      raceYear = act.raceLink.raceYear;
      date = act.date;
      distKm = act.distKm;
      via = 'activity';
    } else {
      const meta = gpxMeta(raw);
      const race = matchRaceFromGpx(meta, marathons);
      if (!race) {
        const why = !act
          ? `no activity ${activityId} in activities.json and no race match from GPX`
          : act.raceLink?.status === 'unlogged'
            ? 'unlogged marathon (not in marathons.json)'
            : 'not a matched marathon';
        console.warn(`Skip ${file} — ${why}`);
        continue;
      }
      key = raceKey(race);
      raceName = race.name;
      raceYear = race.year;
      date = meta.date;
      distKm = act?.distKm ?? trackDistanceKm(allPoints);
      via = act ? 'gpx+activity fallback' : 'gpx fallback';
    }

    const points = downsample(allPoints);
    const elev = elevStats(allPoints);
    tracks[key] = {
      activityId,
      raceKey: key,
      raceName,
      raceYear,
      date,
      distKm,
      trackKm: trackDistanceKm(allPoints),
      sourceFile: file,
      pointCount: allPoints.length,
      simplifiedCount: points.length,
      ...elev,
      points,
    };

    const detail = parseGpxDetailSeries(raw);
    if (detail) {
      const detailPath = writeActivityDetails(activityId, {
        activityId,
        raceKey: key,
        raceName,
        raceYear,
        date,
        sourceFile: file,
        ...detail,
        summary: {
          ...detail.summary,
          ...elev,
          distKm: act?.distKm ?? detail.summary.distKm,
          durationSec: act?.durationSec ?? detail.summary.durationSec,
          avgHr: act?.avgHr ?? detail.summary.avgHr,
          maxHr: act?.maxHr ?? detail.summary.maxHr,
          avgCadence: act?.avgCadence ?? detail.summary.avgCad,
          avgPower: act?.avgPower ?? detail.summary.avgPower,
          avgGct: act?.avgGct ?? detail.summary.avgGct,
          avgVerticalOsc: act?.avgVerticalOsc ?? detail.summary.avgVo,
          calories: act?.calories ?? null,
        },
      });
      console.log(`  ↳ charts ${detailPath} (${detail.series.length} pts)`);
    }

    added += 1;
    console.log(`✓ ${key} — ${allPoints.length} pts → ${points.length} (${file}, ${via})`);
  }

  const payload = {
    meta: {
      importedAt: new Date().toISOString().slice(0, 10),
      count: Object.keys(tracks).length,
      gpxDir: 'data/gpx/marathons',
    },
    tracks,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath} (${Object.keys(tracks).length} tracks, ${added} updated this run)`);
}

main();
