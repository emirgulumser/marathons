/**
 * Race predictions from Garmin activities — shared by browser and import script.
 */
const RUN_TYPES = new Set([
  'running', 'indoor_running', 'trail_running', 'treadmill_running',
  'street_running', 'ultra_run',
]);

const HARD_TRAINING_EFFECTS = new Set(['TEMPO', 'THRESHOLD', 'VO2_MAX', 'ANAEROBIC', 'SPEED']);

const RIEGEL_EXP = 1.06;
const MARATHON_KM = 42.195;
const HALF_KM = 21.0975;
const DIST_KM = { '5k': 5, '10k': 10, half: HALF_KM, marathon: MARATHON_KM };
const DEFAULT_WINDOW_DAYS = 180;
const BLOCK_WEEKS = 12;
const THRESHOLD_MARATHON_FACTOR = 1.04;
const BLOCK_K = 5;

/**
 * Garmin wrist VO₂ often reads ~2–3 pts above Daniels VDOT / lab values.
 * Marathon minutes from Jack Daniels equivalent race times (not “M pace” only).
 */
const GARMIN_TO_VDOT_OFFSET = -2.5;

const VDOT_MARATHON = [
  [40, 258], [45, 230], [50, 206], [55, 187], [60, 172],
  [65, 159], [70, 149],
];

function garminVo2ToVdot(garminVo2) {
  return garminVo2 + GARMIN_TO_VDOT_OFFSET;
}

function vo2ToMarathonMinutes(vo2, { applyGarminOffset = true } = {}) {
  if (vo2 == null || !Number.isFinite(vo2)) return null;
  const vdot = applyGarminOffset ? garminVo2ToVdot(vo2) : vo2;
  if (vdot <= VDOT_MARATHON[0][0]) return VDOT_MARATHON[0][1];
  if (vdot >= VDOT_MARATHON[VDOT_MARATHON.length - 1][0]) {
    return VDOT_MARATHON[VDOT_MARATHON.length - 1][1];
  }
  for (let i = 1; i < VDOT_MARATHON.length; i++) {
    const [v0, m0] = VDOT_MARATHON[i - 1];
    const [v1, m1] = VDOT_MARATHON[i];
    if (vdot <= v1) {
      const t = (vdot - v0) / (v1 - v0);
      return m0 + t * (m1 - m0);
    }
  }
  return null;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || !YMD_RE.test(dateStr)) return false;
  const d = new Date(`${dateStr}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

function parseYmd(dateStr) {
  if (!isValidYmd(dateStr)) return null;
  return new Date(`${dateStr}T12:00:00`);
}

function ymd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStrOrDate, n) {
  const base = typeof dateStrOrDate === 'string' ? parseYmd(dateStrOrDate) : dateStrOrDate;
  if (!base) return null;
  const x = new Date(base);
  x.setDate(x.getDate() + n);
  return x;
}

function shiftYmd(dateStr, days) {
  return ymd(addDays(dateStr, days));
}

function clampYmd(dateStr, minStr, maxStr) {
  if (!isValidYmd(dateStr)) return null;
  if (minStr && dateStr < minStr) return minStr;
  if (maxStr && dateStr > maxStr) return maxStr;
  return dateStr;
}

function daysBetween(a, b) {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return NaN;
  return Math.round((db - da) / 86400000);
}

function isRun(a) {
  return RUN_TYPES.has(a.type);
}

function minutesFromPace(paceMinKm, distKm) {
  return paceMinKm * distKm;
}

function paceFromMinutes(minutes, distKm) {
  return minutes / distKm;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function riegelMinutes(fromDistKm, fromMinutes, toDistKm) {
  return fromMinutes * Math.pow(toDistKm / fromDistKm, RIEGEL_EXP);
}

function runsBefore(activities, asOfDate) {
  return activities.filter(a => isRun(a) && a.date <= asOfDate);
}

function rollingBestEfforts(runs, asOfDate, windowDays, tags) {
  const start = shiftYmd(asOfDate, -windowDays);
  if (!start) return {};
  const inWindow = runs.filter(a => a.date >= start && a.date <= asOfDate && a.paceMinKm);
  const best = {};
  for (const tag of tags) {
    const candidates = inWindow.filter(a => a.raceTag === tag);
    if (!candidates.length) continue;
    candidates.sort((a, b) => a.paceMinKm - b.paceMinKm || b.date.localeCompare(a.date));
    const top = candidates[0];
    best[tag] = {
      id: top.id,
      date: top.date,
      name: top.name,
      distKm: top.distKm,
      paceMinKm: top.paceMinKm,
      minutes: minutesFromPace(top.paceMinKm, DIST_KM[tag] || top.distKm),
    };
  }
  return best;
}

function latestVo2Max(runs, asOfDate, windowDays = 365) {
  const start = shiftYmd(asOfDate, -windowDays);
  if (!start) return null;
  const withVo2 = runs
    .filter(a => a.date >= start && a.date <= asOfDate && a.vo2Max != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return withVo2[0] || null;
}

function thresholdPace(runs, asOfDate, windowDays = DEFAULT_WINDOW_DAYS) {
  const start = shiftYmd(asOfDate, -windowDays);
  if (!start) return null;
  const hard = runs
    .filter(a =>
      a.date >= start && a.date <= asOfDate &&
      a.distKm >= 5 && a.paceMinKm &&
      HARD_TRAINING_EFFECTS.has(a.trainingEffect)
    )
    .map(a => a.paceMinKm)
    .sort((a, b) => a - b);
  if (!hard.length) return null;
  return hard[Math.floor(hard.length / 2)];
}

function weeklyKmInWindow(runs, endDateStr, weeks) {
  const end = parseYmd(endDateStr);
  const weekly = [];
  for (let w = weeks; w >= 1; w--) {
    const weekStart = ymd(addDays(end, -w * 7));
    const weekEnd = ymd(addDays(end, -(w - 1) * 7 - 1));
    const km = runs
      .filter(a => a.date >= weekStart && a.date <= weekEnd)
      .reduce((s, a) => s + a.distKm, 0);
    weekly.push({ weekNum: w, start: weekStart, end: weekEnd, km: Math.round(km * 10) / 10 });
  }
  return weekly;
}

function blockFeaturesFromRuns(runs, asOfDate, blockWeeks = BLOCK_WEEKS) {
  const weekly = weeklyKmInWindow(runs, asOfDate, blockWeeks);
  const peakWeek = weekly.reduce((best, w) => (!best || w.km > best.km ? w : best), null);
  const totalKm = runs.reduce((s, a) => s + a.distKm, 0);
  const longest = runs.reduce((best, a) => (!best || a.distKm > best.distKm ? a : best), null);
  return {
    avgWeeklyKm: totalKm / blockWeeks,
    peakWeekKm: peakWeek?.km || 0,
    runsOver20: runs.filter(a => a.distKm > 20).length,
    hardRuns: runs.filter(a => HARD_TRAINING_EFFECTS.has(a.trainingEffect)).length,
    longestDistKm: longest?.distKm || 0,
    activeWeeks: weekly.filter(w => w.km > 0).length,
  };
}

function normalizeFeatures(f) {
  return [
    f.avgWeeklyKm / 100,
    f.peakWeekKm / 120,
    f.runsOver20 / 10,
    f.hardRuns / 15,
    f.longestDistKm / 35,
  ];
}

function featureDistance(a, b) {
  const va = normalizeFeatures(a);
  const vb = normalizeFeatures(b);
  let sum = 0;
  for (let i = 0; i < va.length; i++) sum += (va[i] - vb[i]) ** 2;
  return Math.sqrt(sum);
}

function modelRiegel(bestEfforts, targetKm) {
  const tags = ['half', '10k', '5k', 'marathon'];
  let best = null;
  for (const tag of tags) {
    const src = bestEfforts[tag];
    if (!src) continue;
    const fromKm = DIST_KM[tag] || src.distKm;
    const minutes = riegelMinutes(fromKm, src.minutes, targetKm);
    if (!best || minutes < best.minutes) {
      best = { minutes, source: { tag, ...src } };
    }
  }
  return best;
}

function modelThreshold(runs, asOfDate, targetKm) {
  const pace = thresholdPace(runs, asOfDate);
  if (pace == null) return null;
  const marathonPace = pace * THRESHOLD_MARATHON_FACTOR;
  const minutes = minutesFromPace(marathonPace, targetKm);
  const hardCount = runs.filter(a => {
    const start = shiftYmd(asOfDate, -DEFAULT_WINDOW_DAYS);
    if (!start) return false;
    return a.date >= start && a.date <= asOfDate &&
      a.distKm >= 5 && HARD_TRAINING_EFFECTS.has(a.trainingEffect);
  }).length;
  return { minutes, paceMinKm: marathonPace, hardRunCount: hardCount };
}

function modelVo2(runs, asOfDate, targetKm) {
  const row = latestVo2Max(runs, asOfDate);
  if (!row) return null;
  const effectiveVdot = Math.round(garminVo2ToVdot(row.vo2Max) * 10) / 10;
  const marathonMin = vo2ToMarathonMinutes(row.vo2Max);
  if (marathonMin == null) return null;
  const minutes = targetKm === MARATHON_KM
    ? marathonMin
    : riegelMinutes(MARATHON_KM, marathonMin, targetKm);
  return {
    minutes,
    vo2Max: row.vo2Max,
    effectiveVdot,
    date: row.date,
    activityId: row.id,
  };
}

function modelBlockSim(runs, marathonBlocks, asOfDate) {
  const start = shiftYmd(asOfDate, -BLOCK_WEEKS * 7);
  if (!start) return null;
  const blockRuns = runs.filter(a => a.date >= start && a.date <= asOfDate);
  const current = blockFeaturesFromRuns(blockRuns, asOfDate);
  if (current.activeWeeks < 4) return null;

  const neighbors = marathonBlocks
    .filter(b => b.raceDate <= asOfDate && b.raceMinutes != null)
    .map(b => {
      const hist = {
        avgWeeklyKm: b.avgWeeklyKm,
        peakWeekKm: b.peakWeek?.km || 0,
        runsOver20: b.runsOver20,
        hardRuns: b.hardRuns,
        longestDistKm: b.longest?.distKm || 0,
        activeWeeks: b.activeWeeks,
      };
      const dist = featureDistance(current, hist);
      return { key: b.key, raceName: b.raceName, raceYear: b.raceYear, minutes: b.raceMinutes, dist };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, BLOCK_K);

  if (!neighbors.length) return null;

  let weightSum = 0;
  let weighted = 0;
  for (const n of neighbors) {
    const w = 1 / (n.dist + 0.05);
    weightSum += w;
    weighted += w * n.minutes;
  }
  return {
    minutes: weighted / weightSum,
    neighbors: neighbors.map(n => ({
      key: n.key,
      label: `${n.raceName} ${n.raceYear}`,
      minutes: n.minutes,
      dist: Math.round(n.dist * 1000) / 1000,
    })),
    activeWeeks: current.activeWeeks,
  };
}

function buildEnsemble(modelMinutes) {
  const values = modelMinutes.filter(v => v != null && Number.isFinite(v));
  if (!values.length) {
    return { minutes: null, paceMinKm: null, confidence: 'none', spreadMin: null, spread: null, modelCount: 0 };
  }
  const med = median(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const count = values.length;
  const confidence = count >= 3 ? 'high' : count === 2 ? 'medium' : 'low';
  return {
    minutes: Math.round(med * 10) / 10,
    paceMinKm: Math.round(paceFromMinutes(med, MARATHON_KM) * 100) / 100,
    confidence,
    spreadMin: Math.round((max - min) * 10) / 10,
    spread: { min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10 },
    modelCount: count,
  };
}

function predictDistanceTarget(runs, marathonBlocks, asOfDate, targetKm, tags) {
  const bestEfforts = rollingBestEfforts(runs, asOfDate, DEFAULT_WINDOW_DAYS, tags);
  const riegel = modelRiegel(bestEfforts, targetKm);
  const threshold = targetKm === MARATHON_KM ? modelThreshold(runs, asOfDate, targetKm) : null;
  const vo2 = modelVo2(runs, asOfDate, targetKm);
  const blockSim = targetKm === MARATHON_KM ? modelBlockSim(runs, marathonBlocks, asOfDate) : null;

  const modelMinutes = [
    riegel?.minutes,
    threshold?.minutes,
    vo2?.minutes,
    blockSim?.minutes,
  ];
  const ensemble = buildEnsemble(modelMinutes);
  ensemble.paceMinKm = ensemble.minutes != null
    ? Math.round(paceFromMinutes(ensemble.minutes, targetKm) * 100) / 100
    : null;

  return {
    ...ensemble,
    models: {
      riegel: riegel ? { minutes: Math.round(riegel.minutes * 10) / 10, source: riegel.source } : null,
      threshold: threshold ? {
        minutes: Math.round(threshold.minutes * 10) / 10,
        paceMinKm: Math.round(threshold.paceMinKm * 100) / 100,
        hardRunCount: threshold.hardRunCount,
      } : null,
      vo2: vo2 ? {
        minutes: Math.round(vo2.minutes * 10) / 10,
        vo2Max: vo2.vo2Max,
        effectiveVdot: vo2.effectiveVdot,
        date: vo2.date,
        activityId: vo2.activityId,
      } : null,
      blockSim: blockSim ? {
        minutes: Math.round(blockSim.minutes * 10) / 10,
        neighbors: blockSim.neighbors,
        activeWeeks: blockSim.activeWeeks,
      } : null,
    },
    bestEfforts,
  };
}

function emptyPrediction(asOfDate) {
  const empty = {
    minutes: null,
    paceMinKm: null,
    confidence: 'none',
    spreadMin: null,
    spread: null,
    modelCount: 0,
    models: { riegel: null, threshold: null, vo2: null, blockSim: null },
    bestEfforts: {},
  };
  return { asOfDate, marathon: { ...empty }, half: { ...empty } };
}

function predictAsOf(activities, marathonBlocks, marathons, asOfDate) {
  if (!isValidYmd(asOfDate)) {
    const fallback = latestRunDate(activities);
    if (!fallback) return emptyPrediction(asOfDate);
    asOfDate = fallback;
  }
  const runs = runsBefore(activities, asOfDate);
  const blocks = marathonBlocks || [];

  const marathon = predictDistanceTarget(
    runs, blocks, asOfDate, MARATHON_KM, ['5k', '10k', 'half', 'marathon']
  );
  const half = predictDistanceTarget(
    runs, blocks, asOfDate, HALF_KM, ['5k', '10k', 'half', 'marathon']
  );

  return { asOfDate, marathon, half };
}

function latestRunDate(activities) {
  const runs = activities.filter(isRun);
  if (!runs.length) return null;
  return runs.reduce((max, a) => (a.date > max ? a.date : max), runs[0].date);
}

function earliestRunDate(activities) {
  const runs = activities.filter(isRun);
  if (!runs.length) return null;
  return runs.reduce((min, a) => (a.date < min ? a.date : min), runs[0].date);
}

function computeTimeline(activities, marathonBlocks, marathons, endDate, years = 5) {
  if (!isValidYmd(endDate)) return [];
  const start = shiftYmd(endDate, -years * 365);
  if (!start) return [];
  const points = [];
  let d = parseYmd(start);
  const end = parseYmd(endDate);
  if (!d || !end) return [];
  while (d <= end) {
    const date = ymd(d);
    if (!date) break;
    const pred = predictAsOf(activities, marathonBlocks, marathons, date);
    if (pred.marathon.minutes != null) {
      points.push({
        date,
        marathonMinutes: pred.marathon.minutes,
        modelCount: pred.marathon.modelCount,
      });
    }
    d.setMonth(d.getMonth() + 1);
  }
  return points;
}

function computeBacktest(activities, marathonBlocks, marathons) {
  return marathonBlocks
    .filter(b => b.raceMinutes != null && b.raceDate)
    .map(b => {
      const predictDate = shiftYmd(b.raceDate, -7);
      if (!predictDate) return null;
      const pred = predictAsOf(activities, marathonBlocks, marathons, predictDate);
      const predictedMinutes = pred.marathon.minutes;
      return {
        key: b.key,
        raceName: b.raceName,
        raceYear: b.raceYear,
        raceDate: b.raceDate,
        predictDate,
        actualMinutes: b.raceMinutes,
        predictedMinutes,
        errorMin: predictedMinutes != null
          ? Math.round((b.raceMinutes - predictedMinutes) * 10) / 10
          : null,
        raceActivityId: b.raceActivityId,
        modelCount: pred.marathon.modelCount,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.raceDate.localeCompare(a.raceDate));
}

function computeRacePredictions(activities, marathons, marathonBlocks) {
  const defaultDate = latestRunDate(activities) || new Date().toISOString().slice(0, 10);
  const minDate = earliestRunDate(activities) || defaultDate;
  const current = predictAsOf(activities, marathonBlocks, marathons, defaultDate);
  return {
    asOf: defaultDate,
    defaultDate,
    minDate,
    current,
    timeline: computeTimeline(activities, marathonBlocks, marathons, defaultDate, 5),
    backtest: computeBacktest(activities, marathonBlocks, marathons),
  };
}

function findRaceAtPredictDate(asOfDate, marathonBlocks) {
  return marathonBlocks.find(b => shiftYmd(b.raceDate, -7) === asOfDate) || null;
}

function findUpcomingRace(asOfDate, marathonBlocks, maxDays = 21) {
  const upcoming = marathonBlocks
    .filter(b => b.raceDate > asOfDate && daysBetween(asOfDate, b.raceDate) <= maxDays)
    .sort((a, b) => a.raceDate.localeCompare(b.raceDate));
  return upcoming[0] || null;
}

function findCompareRace(asOfDate, marathonBlocks, preferredKey, maxDays = 21) {
  if (preferredKey) {
    const picked = marathonBlocks.find(b => b.key === preferredKey && b.raceDate > asOfDate);
    if (picked) return picked;
  }
  const exact = findRaceAtPredictDate(asOfDate, marathonBlocks);
  if (exact) return exact;
  return findUpcomingRace(asOfDate, marathonBlocks, maxDays);
}

function backtestStats(backtest) {
  const withPred = backtest.filter(b => b.errorMin != null);
  if (!withPred.length) return { count: 0, mae: null, within5: null, within10: null };
  const absErrors = withPred.map(b => Math.abs(b.errorMin));
  const mae = Math.round((absErrors.reduce((s, e) => s + e, 0) / absErrors.length) * 10) / 10;
  const within5 = Math.round((absErrors.filter(e => e <= 5).length / withPred.length) * 1000) / 10;
  const within10 = Math.round((absErrors.filter(e => e <= 10).length / withPred.length) * 1000) / 10;
  return { count: withPred.length, mae, within5, within10 };
}

export {
  predictAsOf,
  computeRacePredictions,
  findUpcomingRace,
  findCompareRace,
  findRaceAtPredictDate,
  backtestStats,
  riegelMinutes,
  vo2ToMarathonMinutes,
  daysBetween,
  MARATHON_KM,
  HALF_KM,
};

if (typeof window !== 'undefined') {
  window.RacePrediction = {
    predictAsOf,
    computeRacePredictions,
    findUpcomingRace,
    findCompareRace,
    findRaceAtPredictDate,
    backtestStats,
    riegelMinutes,
    daysBetween,
    MARATHON_KM,
    HALF_KM,
  };
}