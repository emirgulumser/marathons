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
  if (!fs.existsSync(activitiesPath)) {
    console.error('Missing data/activities.json — run import-garmin.mjs first');
    process.exit(1);
  }
  if (!fs.existsSync(gpxDir)) {
    console.error(`GPX folder not found: ${gpxDir}`);
    process.exit(1);
  }

  const { activities } = JSON.parse(fs.readFileSync(activitiesPath, 'utf8'));
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
          ? `no activity ${activityId} in activities.json`
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
      points,
    };
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
