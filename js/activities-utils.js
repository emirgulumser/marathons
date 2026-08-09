/** Shared helpers for Activities tab — filters, aggregates, heatmap, charts. */
window.ActivitiesUtils = (function () {
  const RUN_TYPES = new Set([
    'running', 'indoor_running', 'trail_running', 'treadmill_running',
    'street_running', 'ultra_run',
  ]);

  const TYPE_LABELS = {
    running: 'Running',
    indoor_running: 'Indoor Run',
    trail_running: 'Trail Run',
    treadmill_running: 'Treadmill',
    street_running: 'Street Run',
    ultra_run: 'Ultra Run',
    cycling: 'Cycling',
    indoor_cycling: 'Indoor Cycling',
    hiking: 'Hiking',
    open_water_swimming: 'Open Water Swim',
    lap_swimming: 'Pool Swim',
    other: 'Other',
  };

  function typeLabel(t) {
    return TYPE_LABELS[t] || String(t).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function fmtPace(minPerKm) {
    if (minPerKm == null || !Number.isFinite(minPerKm)) return '—';
    const m = Math.floor(minPerKm);
    const s = Math.round((minPerKm - m) * 60);
    return `${m}:${String(s).padStart(2, '0')}/km`;
  }

  function isRun(a) {
    return RUN_TYPES.has(a.type);
  }

  function getFilters() {
    const state = window.actFilterState || {};
    return {
      search: document.getElementById('actSearchInput')?.value || state.search || '',
      type: document.getElementById('actTypeFilter')?.value || state.type || 'all',
      year: state.year ?? 'all',
      minDist: state.minDist ?? null,
      date: state.date || null,
    };
  }

  function filterActivities(activities, filters) {
    let list = [...activities];
    const f = filters || getFilters();

    if (f.type === 'unlogged') {
      list = list.filter(a => a.raceLink?.status === 'unlogged');
    } else if (f.type === 'running') {
      list = list.filter(isRun);
    } else if (f.type !== 'all') {
      list = list.filter(a => a.type === f.type);
    }
    if (f.year !== 'all') list = list.filter(a => String(a.year) === String(f.year));
    if (f.date) list = list.filter(a => a.date === f.date);
    if (f.minDist != null) list = list.filter(a => a.distKm > f.minDist);

    const q = (f.search || '').toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q) ||
        typeLabel(a.type).toLowerCase().includes(q)
      );
    }
    return list;
  }

  function aggregateFiltered(list) {
    const runs = list.filter(isRun);
    const totalKm = runs.reduce((s, a) => s + a.distKm, 0);
    const totalSec = runs.reduce((s, a) => s + a.durationSec, 0);
    const totalElev = runs.reduce((s, a) => s + (a.elevGainM || 0), 0);
    const hrRuns = runs.filter(a => a.avgHr);
    const avgHr = hrRuns.length
      ? Math.round(hrRuns.reduce((s, a) => s + a.avgHr, 0) / hrRuns.length)
      : null;
    const pace = totalKm > 0 ? (totalSec / 60) / totalKm : null;
    return {
      total: list.length,
      runs: runs.length,
      totalKm: Math.round(totalKm),
      totalHours: Math.round(totalSec / 3600),
      avgPace: pace,
      totalElev: Math.round(totalElev),
      avgHr,
    };
  }


  function kmByYear(list) {
    const map = {};
    list.filter(isRun).forEach(a => {
      map[a.year] = (map[a.year] || 0) + a.distKm;
    });
    const years = Object.keys(map).map(Number).sort((a, b) => a - b);
    return { years, values: years.map(y => Math.round(map[y])) };
  }

  function buildDayMapForIsoYear(source, isoYear, fromActivities) {
    const map = new Map();
    if (fromActivities) {
      source.forEach(a => {
        if (!isoWeekKey(a.date).startsWith(`${isoYear}-`)) return;
        let row = map.get(a.date);
        if (!row) row = { km: 0, runs: 0, count: 0 };
        row.count += 1;
        if (isRun(a)) {
          row.km += a.distKm;
          row.runs += 1;
        }
        map.set(a.date, row);
      });
    }
    return map;
  }

  function kmByMonth(list, year) {
    const map = {};
    list.filter(a => isRun(a) && a.year === year).forEach(a => {
      map[a.month] = (map[a.month] || 0) + a.distKm;
    });
    const months = [...Array(12)].map((_, i) => i + 1);
    return { months, values: months.map(m => Math.round((map[m] || 0) * 10) / 10) };
  }

  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const target = new Date(d);
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const isoYear = target.getFullYear();
    const firstThu = new Date(isoYear, 0, 4);
    const week = 1 + Math.round(((target - firstThu) / 86400000 - 3 + (firstThu.getDay() + 6) % 7) / 7);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
  }

  function isoWeekRange(isoYear, week) {
    const firstThu = new Date(isoYear, 0, 4);
    const monday = new Date(firstThu);
    monday.setDate(firstThu.getDate() - 3 + (week - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);
    return { start: fmt(monday), end: fmt(sunday) };
  }

  function kmByWeek(list, year) {
    const map = new Map();
    list.filter(isRun).forEach(a => {
      const key = isoWeekKey(a.date);
      const [y, wStr] = key.split('-W');
      if (Number(y) !== year) return;
      const wk = Number(wStr);
      map.set(wk, (map.get(wk) || 0) + a.distKm);
    });
    const maxWeek = Math.max(52, ...map.keys(), 0);
    const labels = [];
    const values = [];
    const ranges = [];
    for (let w = 1; w <= maxWeek; w++) {
      labels.push(`W${w}`);
      values.push(Math.round((map.get(w) || 0) * 10) / 10);
      ranges.push(isoWeekRange(year, w));
    }
    return { labels, values, ranges };
  }

  function weeklyKmTotals(list) {
    const map = new Map();
    list.filter(isRun).forEach(a => {
      const key = isoWeekKey(a.date);
      map.set(key, (map.get(key) || 0) + a.distKm);
    });
    return [...map.values()];
  }

  function weeklyKmTotalsForYear(list, year) {
    const map = new Map();
    list.filter(isRun).forEach(a => {
      const key = isoWeekKey(a.date);
      if (!key.startsWith(`${year}-`)) return;
      map.set(key, (map.get(key) || 0) + a.distKm);
    });
    return [...map.values()];
  }

  function weeksOverKm(list, minKm, year) {
    const totals = year != null ? weeklyKmTotalsForYear(list, year) : weeklyKmTotals(list);
    return totals.filter(km => km >= minKm).length;
  }

  function yearsWithWeekOverKm(list, minKm) {
    const byWeek = new Map();
    list.filter(isRun).forEach(a => {
      const key = isoWeekKey(a.date);
      byWeek.set(key, (byWeek.get(key) || 0) + a.distKm);
    });
    const years = new Set();
    byWeek.forEach((km, key) => {
      if (km >= minKm) years.add(Number(key.slice(0, 4)));
    });
    return [...years].sort((a, b) => b - a);
  }

  const WEEK_THRESHOLDS = [50, 80, 100];

  const WEEK_VOLUME_BANDS = [
    { min: 100, label: '100+ km', color: '#ef4444' },
    { min: 80, label: '80–99 km', color: '#f97316' },
    { min: 50, label: '50–79 km', color: '#22c55e' },
    { min: 0, label: 'Under 50 km', color: '#3b82f6' },
  ];

  const MONTH_VOLUME_BANDS = [
    { min: 500, label: '500+ km', color: '#dc2626' },
    { min: 400, label: '400–499 km', color: '#ef4444' },
    { min: 320, label: '320–399 km', color: '#f97316' },
    { min: 200, label: '200–319 km', color: '#22c55e' },
    { min: 0, label: 'Under 200 km', color: '#3b82f6' },
  ];

  const YEAR_VOLUME_BANDS = [
    { min: 4000, label: '4000+ km', color: '#dc2626' },
    { min: 3500, label: '3500–3999 km', color: '#ef4444' },
    { min: 2500, label: '2500–3499 km', color: '#f97316' },
    { min: 1500, label: '1500–2499 km', color: '#22c55e' },
    { min: 0, label: 'Under 1500 km', color: '#3b82f6' },
  ];

  function volumeBarColors(km, bands) {
    const band = bands.find(b => km >= b.min);
    return { bg: band.color + 'bb', border: band.color };
  }

  function weekBarColors(km) {
    return volumeBarColors(km, WEEK_VOLUME_BANDS);
  }

  function monthBarColors(km) {
    return volumeBarColors(km, MONTH_VOLUME_BANDS);
  }

  function yearBarColors(km) {
    return volumeBarColors(km, YEAR_VOLUME_BANDS);
  }

  function buildDayMap(source, year, fromActivities) {
    const map = new Map();
    if (fromActivities) {
      source.forEach(a => {
        if (a.date.slice(0, 4) !== String(year)) return;
        let row = map.get(a.date);
        if (!row) row = { km: 0, runs: 0, count: 0 };
        row.count += 1;
        if (isRun(a)) {
          row.km += a.distKm;
          row.runs += 1;
        }
        map.set(a.date, row);
      });
    } else {
      (source || []).forEach(d => {
        if (d.date.slice(0, 4) !== String(year)) return;
        map.set(d.date, { km: d.km, runs: d.runs, count: d.count });
      });
    }
    return map;
  }

  function buildDayMapAll(source, fromActivities) {
    const map = new Map();
    if (fromActivities) {
      source.forEach(a => {
        let row = map.get(a.date);
        if (!row) row = { km: 0, runs: 0, count: 0 };
        row.count += 1;
        if (isRun(a)) {
          row.km += a.distKm;
          row.runs += 1;
        }
        map.set(a.date, row);
      });
    } else {
      (source || []).forEach(d => {
        map.set(d.date, { km: d.km, runs: d.runs, count: d.count });
      });
    }
    return map;
  }

  function heatmapWeeksRange(dateStrings) {
    if (!dateStrings.length) return [];
    const sorted = [...dateStrings].sort();
    const start = new Date(sorted[0] + 'T12:00:00');
    const end = new Date(sorted[sorted.length - 1] + 'T12:00:00');
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

    const weeks = [];
    let week = [];
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      week.push(fmt(d));
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }

  function heatmapLevels(dayMap, metric) {
    const vals = [...dayMap.values()].map(d => d[metric] || 0).filter(v => v > 0).sort((a, b) => a - b);
    const max = vals.length ? vals[vals.length - 1] : 1;
    function level(v) {
      if (!v || v <= 0) return 0;
      const t = Math.pow(v / max, 0.5);
      if (t <= 0.12) return 1;
      if (t <= 0.28) return 2;
      if (t <= 0.5) return 3;
      return 4;
    }
    return { level, max };
  }

  function isoWeeksInYear(isoYear) {
    return Number(isoWeekKey(`${isoYear}-12-28`).split('-W')[1]);
  }

  function heatmapWeeks(year) {
    const lastWeek = isoWeeksInYear(year);
    const start = parseYmd(isoWeekRange(year, 1).start);
    const end = parseYmd(isoWeekRange(year, lastWeek).end);
    const weeks = [];
    let week = [];
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      week.push(fmt(d));
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
    return weeks;
  }

  function findSimilar(activity, activities, limit = 3) {
    return activities
      .filter(a => a.id !== activity.id && isRun(a))
      .map(a => {
        let score = 0;
        if (activity.location && a.location === activity.location) score += 3;
        if (activity.distKm && a.distKm) {
          const ratio = Math.abs(a.distKm - activity.distKm) / activity.distKm;
          if (ratio <= 0.1) score += 2;
        }
        return { a, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.a.date.localeCompare(a.a.date))
      .slice(0, limit)
      .map(x => x.a);
  }

  function raceBadge(a) {
    if (!a.raceTag && !a.raceLink) return '';
    if (a.raceLink?.status === 'matched') return ' ✓';
    if (a.raceLink?.status === 'unverified') return ' ·';
    if (a.raceLink?.status === 'unlogged') return ' ?';
    if (a.raceTag === 'marathon') return ' 🏅';
    if (a.raceTag === 'half') return ' ½';
    return '';
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function marathonRaceForActivity(a, races) {
    const list = races || (typeof App !== 'undefined' ? App.races : []) || [];
    const rl = a?.raceLink;
    if (rl?.kind === 'marathon' && rl.raceName && rl.raceYear != null) {
      const linked = list.find(r => r.name === rl.raceName && r.year === rl.raceYear);
      if (linked) return linked;
    }
    if (!a || !isRun(a) || a.distKm < 40 || a.distKm > 46) return null;

    const loc = (a.location || '').toLowerCase();
    const name = (a.name || '').toLowerCase();

    for (const r of list) {
      if (r.year !== a.year) continue;
      const rn = r.name.toLowerCase();
      const nameMatch = loc === rn || loc.includes(rn) || name.includes(rn);
      const gpsMatch = a.lat != null && r.lat != null &&
        haversineKm(a.lat, a.lng, r.lat, r.lng) < 40;
      if (nameMatch || gpsMatch) return r;
    }
    return null;
  }

  function marathonCountryCode(a, races) {
    return marathonRaceForActivity(a, races)?.country || null;
  }

  function raceFlagHtml(a, races, w = 18) {
    const code = marathonCountryCode(a, races);
    if (!code || typeof flagImgHtml !== 'function') return '';
    return flagImgHtml(code, w);
  }

  function activityNameHtml(a, races) {
    const flag = raceFlagHtml(a, races);
    const badge = raceBadge(a);
    const name = escapeHtml(a.name || '');
    if (!flag) return `${name}${badge}`;
    return `<span class="cell-flag-label">${flag}<span>${name}${badge}</span></span>`;
  }

  const MARATHON_BLOCK_WEEKS = 12;
  const HARD_TRAINING_EFFECTS = new Set(['TEMPO', 'THRESHOLD', 'VO2_MAX', 'ANAEROBIC', 'SPEED']);

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

  function trainingBlockWindow(raceDateStr, weeks = MARATHON_BLOCK_WEEKS) {
    const race = parseYmd(raceDateStr);
    return {
      start: ymd(addDays(race, -weeks * 7)),
      end: ymd(addDays(race, -1)),
      raceDate: raceDateStr,
      weeks,
    };
  }

  function runsInTrainingBlock(activities, window, excludeActivityId) {
    return activities.filter(a =>
      isRun(a) &&
      a.date >= window.start &&
      a.date <= window.end &&
      a.id !== excludeActivityId
    );
  }

  function weeklyKmInBlock(runs, raceDateStr, weeks = MARATHON_BLOCK_WEEKS) {
    const race = parseYmd(raceDateStr);
    const weekly = [];
    for (let w = weeks; w >= 1; w--) {
      const weekStart = ymd(addDays(race, -w * 7));
      const weekEnd = ymd(addDays(race, -(w - 1) * 7 - 1));
      const km = runs
        .filter(a => a.date >= weekStart && a.date <= weekEnd)
        .reduce((s, a) => s + a.distKm, 0);
      weekly.push({
        label: `W-${w}`,
        weekNum: w,
        start: weekStart,
        end: weekEnd,
        km: Math.round(km * 10) / 10,
      });
    }
    return weekly;
  }

  function computeMarathonTrainingBlock(activities, race, blockWeeks = MARATHON_BLOCK_WEEKS) {
    const raceActivity = findMarathonActivity(activities, race);
    if (!raceActivity) return null;

    const window = trainingBlockWindow(raceActivity.date, blockWeeks);
    const runs = runsInTrainingBlock(activities, window, raceActivity.id);
    const totalKm = Math.round(runs.reduce((s, a) => s + a.distKm, 0) * 10) / 10;
    const runCount = runs.length;
    const runsOver15 = runs.filter(a => a.distKm >= 15).length;
    const runsOver20 = runs.filter(a => a.distKm > 20).length;
    const runsOver25 = runs.filter(a => a.distKm > 25).length;
    const runsOver30 = runs.filter(a => a.distKm > 30).length;
    const longest = runs.reduce((best, a) => (!best || a.distKm > best.distKm ? a : best), null);
    const weekly = weeklyKmInBlock(runs, raceActivity.date, blockWeeks);
    const peakWeek = weekly.reduce((best, w) => (!best || w.km > best.km ? w : best), null);
    const taperWeeks = weekly.filter(w => w.weekNum <= 2);
    const taperAvgKm = taperWeeks.length
      ? Math.round((taperWeeks.reduce((s, w) => s + w.km, 0) / taperWeeks.length) * 10) / 10
      : 0;
    const taperVsPeakPct = peakWeek?.km
      ? Math.round((taperAvgKm / peakWeek.km) * 100)
      : null;
    const durationSec = runs.reduce((s, a) => s + (a.durationSec || 0), 0);
    const elevGainM = runs.reduce((s, a) => s + (a.elevGainM || 0), 0);
    const paceKm = runs.filter(a => a.paceMinKm && a.distKm > 0).reduce((s, a) => s + a.paceMinKm * a.distKm, 0);
    const paceDist = runs.filter(a => a.paceMinKm && a.distKm > 0).reduce((s, a) => s + a.distKm, 0);
    const avgPace = paceDist > 0 ? Math.round((paceKm / paceDist) * 100) / 100 : null;
    const hardRuns = runs.filter(a => HARD_TRAINING_EFFECTS.has(a.trainingEffect)).length;
    const weeksOver50 = weekly.filter(w => w.km >= 50).length;
    const weeksOver80 = weekly.filter(w => w.km >= 80).length;
    const weeksOver100 = weekly.filter(w => w.km >= 100).length;
    const activeWeeks = weekly.filter(w => w.km > 0).length;

    return {
      key: marathonKey(race),
      raceName: race.name,
      raceCountry: race.country,
      raceYear: race.year,
      raceTime: race.time,
      raceMinutes: race.minutes ?? null,
      raceDate: raceActivity.date,
      major: !!race.major,
      isPB: !!race.isPB,
      blockWeeks,
      window,
      totalKm,
      runCount,
      runsOver15,
      runsOver20,
      runsOver25,
      runsOver30,
      longest: longest ? { id: longest.id, date: longest.date, distKm: longest.distKm } : null,
      avgWeeklyKm: Math.round((totalKm / blockWeeks) * 10) / 10,
      avgRunsPerWeek: Math.round((runCount / blockWeeks) * 10) / 10,
      peakWeek,
      weekly,
      taperAvgKm,
      taperVsPeakPct,
      durationSec,
      elevGainM,
      avgPace,
      hardRuns,
      weeksOver50,
      weeksOver80,
      weeksOver100,
      activeWeeks,
      raceActivityId: raceActivity.id,
    };
  }

  function computeAllMarathonBlocks(activities, races, blockWeeks = MARATHON_BLOCK_WEEKS) {
    return races
      .map(r => computeMarathonTrainingBlock(activities, r, blockWeeks))
      .filter(Boolean)
      .sort((a, b) => b.raceDate.localeCompare(a.raceDate));
  }

  function avgBlockRow(blocks, label, predicate) {
    const list = predicate ? blocks.filter(predicate) : blocks;
    if (!list.length) return null;
    const n = list.length;
    const sum = key => list.reduce((s, b) => s + (b[key] || 0), 0);
    return {
      label,
      count: n,
      totalKm: Math.round(sum('totalKm') / n * 10) / 10,
      runCount: Math.round(sum('runCount') / n * 10) / 10,
      runsOver20: Math.round(sum('runsOver20') / n * 10) / 10,
      runsOver30: Math.round(sum('runsOver30') / n * 10) / 10,
      avgWeeklyKm: Math.round(sum('avgWeeklyKm') / n * 10) / 10,
      weeksOver50: Math.round(sum('weeksOver50') / n * 10) / 10,
      weeksOver80: Math.round(sum('weeksOver80') / n * 10) / 10,
      weeksOver100: Math.round(sum('weeksOver100') / n * 10) / 10,
      hardRuns: Math.round(sum('hardRuns') / n * 10) / 10,
    };
  }

  const DIST_FILTERS = [
    { id: null, label: 'All' },
    { id: 10, label: '>10 km' },
    { id: 20, label: '>20 km' },
    { id: 21.1, label: '>21.1 km' },
    { id: 30, label: '>30 km' },
    { id: 42.2, label: '>42.2 km' },
  ];

  return {
    RUN_TYPES,
    DIST_FILTERS,
    typeLabel,
    fmtDuration,
    fmtPace,
    isRun,
    getFilters,
    filterActivities,
    aggregateFiltered,
    kmByYear,
    kmByMonth,
    kmByWeek,
    isoWeekKey,
    weeksOverKm,
    yearsWithWeekOverKm,
    WEEK_THRESHOLDS,
    WEEK_VOLUME_BANDS,
    MONTH_VOLUME_BANDS,
    YEAR_VOLUME_BANDS,
    weekBarColors,
    monthBarColors,
    yearBarColors,
    buildDayMap,
    buildDayMapAll,
    buildDayMapForIsoYear,
    heatmapLevels,
    heatmapWeeks,
    heatmapWeeksRange,
    findSimilar,
    raceBadge,
    marathonRaceForActivity,
    marathonCountryCode,
    raceFlagHtml,
    activityNameHtml,
    MARATHON_BLOCK_WEEKS,
    marathonKey,
    computeMarathonTrainingBlock,
    computeAllMarathonBlocks,
    avgBlockRow,
  };
})();
