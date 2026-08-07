/** Node-side activity analytics — ISO weeks and marathon training blocks. */
const RUN_TYPES = new Set([
  'running', 'indoor_running', 'trail_running', 'treadmill_running',
  'street_running', 'ultra_run',
]);

const HARD_TRAINING_EFFECTS = new Set(['TEMPO', 'THRESHOLD', 'VO2_MAX', 'ANAEROBIC', 'SPEED']);
const MARATHON_BLOCK_WEEKS = 12;

function isRun(a) {
  return RUN_TYPES.has(a.type);
}

function parseTime(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function parseYmd(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const target = new Date(d);
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const isoYear = target.getFullYear();
  const firstThu = new Date(isoYear, 0, 4);
  const week = 1 + Math.round(((target - firstThu) / 86400000 - 3 + (firstThu.getDay() + 6) % 7) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export function isoWeekRange(isoYear, week) {
  const firstThu = new Date(isoYear, 0, 4);
  const monday = new Date(firstThu);
  monday.setDate(firstThu.getDate() - 3 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: ymd(monday), end: ymd(sunday) };
}

export function isoWeeksInYear(isoYear) {
  return Number(isoWeekKey(`${isoYear}-12-28`).split('-W')[1]);
}

export function kmByWeek(list, year) {
  const map = new Map();
  list.filter(isRun).forEach(a => {
    const key = isoWeekKey(a.date);
    const [y, wStr] = key.split('-W');
    if (Number(y) !== year) return;
    map.set(Number(wStr), (map.get(Number(wStr)) || 0) + a.distKm);
  });
  const maxWeek = Math.max(52, ...map.keys(), 0);
  const values = [];
  for (let w = 1; w <= maxWeek; w++) {
    values.push(Math.round((map.get(w) || 0) * 10) / 10);
  }
  return values;
}

export function weeksOverKm(list, minKm, year) {
  const map = new Map();
  list.filter(isRun).forEach(a => {
    const key = isoWeekKey(a.date);
    if (year != null && !key.startsWith(`${year}-`)) return;
    map.set(key, (map.get(key) || 0) + a.distKm);
  });
  return [...map.values()].filter(km => km >= minKm).length;
}

function marathonKey(race) {
  return `${race.name}|${race.year}`;
}

function findMarathonActivity(activities, race) {
  return activities.find(a =>
    a.raceLink?.kind === 'marathon' &&
    a.raceLink.raceName === race.name &&
    a.raceLink.raceYear === race.year &&
    (a.raceLink.status === 'matched' || a.raceLink.status === 'unverified')
  ) || null;
}

function weeklyKmInBlock(runs, raceDateStr, weeks) {
  const race = parseYmd(raceDateStr);
  const weekly = [];
  for (let w = weeks; w >= 1; w--) {
    const weekStart = ymd(addDays(race, -w * 7));
    const weekEnd = ymd(addDays(race, -(w - 1) * 7 - 1));
    const km = runs
      .filter(a => a.date >= weekStart && a.date <= weekEnd)
      .reduce((s, a) => s + a.distKm, 0);
    weekly.push({ label: `W-${w}`, weekNum: w, start: weekStart, end: weekEnd, km: Math.round(km * 10) / 10 });
  }
  return weekly;
}

export function computeMarathonTrainingBlock(activities, race, blockWeeks = MARATHON_BLOCK_WEEKS) {
  const raceActivity = findMarathonActivity(activities, race);
  if (!raceActivity) return null;

  const raceDate = parseYmd(raceActivity.date);
  const window = {
    start: ymd(addDays(raceDate, -blockWeeks * 7)),
    end: ymd(addDays(raceDate, -1)),
    raceDate: raceActivity.date,
    weeks: blockWeeks,
  };
  const runs = activities.filter(a =>
    isRun(a) && a.date >= window.start && a.date <= window.end && a.id !== raceActivity.id
  );
  const weekly = weeklyKmInBlock(runs, raceActivity.date, blockWeeks);
  const peakWeek = weekly.reduce((best, w) => (!best || w.km > best.km ? w : best), null);
  const taperWeeks = weekly.filter(w => w.weekNum <= 2);
  const taperAvgKm = taperWeeks.length
    ? Math.round((taperWeeks.reduce((s, w) => s + w.km, 0) / taperWeeks.length) * 10) / 10
    : 0;
  const taperVsPeakPct = peakWeek?.km
    ? Math.round((taperAvgKm / peakWeek.km) * 100)
    : null;
  const longest = runs.reduce((best, a) => (!best || a.distKm > best.distKm ? a : best), null);
  const totalKm = Math.round(runs.reduce((s, a) => s + a.distKm, 0) * 10) / 10;

  return {
    key: marathonKey(race),
    raceName: race.name,
    raceCountry: race.country,
    raceYear: race.year,
    raceTime: race.time,
    raceMinutes: parseTime(race.time),
    raceDate: raceActivity.date,
    major: !!race.major,
    isPB: !!race.isPB,
    blockWeeks,
    window,
    totalKm,
    runCount: runs.length,
    runsOver15: runs.filter(a => a.distKm >= 15).length,
    runsOver20: runs.filter(a => a.distKm > 20).length,
    runsOver25: runs.filter(a => a.distKm > 25).length,
    runsOver30: runs.filter(a => a.distKm > 30).length,
    longest: longest ? { id: longest.id, date: longest.date, distKm: longest.distKm } : null,
    avgWeeklyKm: Math.round((totalKm / blockWeeks) * 10) / 10,
    peakWeek,
    weekly,
    taperAvgKm,
    taperVsPeakPct,
    durationSec: runs.reduce((s, a) => s + (a.durationSec || 0), 0),
    elevGainM: runs.reduce((s, a) => s + (a.elevGainM || 0), 0),
    hardRuns: runs.filter(a => HARD_TRAINING_EFFECTS.has(a.trainingEffect)).length,
    weeksOver50: weekly.filter(w => w.km >= 50).length,
    weeksOver80: weekly.filter(w => w.km >= 80).length,
    weeksOver100: weekly.filter(w => w.km >= 100).length,
    activeWeeks: weekly.filter(w => w.km > 0).length,
    raceActivityId: raceActivity.id,
  };
}

export function computeAllMarathonBlocks(activities, races, blockWeeks = MARATHON_BLOCK_WEEKS) {
  return races
    .map(r => computeMarathonTrainingBlock(activities, r, blockWeeks))
    .filter(Boolean)
    .sort((a, b) => b.raceDate.localeCompare(a.raceDate));
}

export function trainingBlockExcludesRaceDay(activities, race) {
  const act = findMarathonActivity(activities, race);
  if (!act) return null;
  const window = {
    start: ymd(addDays(parseYmd(act.date), -MARATHON_BLOCK_WEEKS * 7)),
    end: ymd(addDays(parseYmd(act.date), -1)),
  };
  const runs = activities.filter(a =>
    isRun(a) && a.date >= window.start && a.date <= window.end && a.id !== act.id
  );
  return !runs.some(a => a.id === act.id);
}
