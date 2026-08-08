/** Shared Garmin activity analytics helpers. */
window.ActivityUtils = {
  TYPE_LABEL: {
    running: 'Road', trail_running: 'Trail', street_running: 'Street',
    treadmill_running: 'Treadmill', indoor_running: 'Indoor', ultra_run: 'Ultra',
    track_running: 'Track', virtual_run: 'Virtual',
  },

  typeLabel(type) {
    return this.TYPE_LABEL[type] || type.replace(/_/g, ' ');
  },

  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const toR = d => (d * Math.PI) / 180;
    const dLat = toR(lat2 - lat1);
    const dLng = toR(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  raceActivityScore(race, act) {
    if (!act.date.startsWith(String(race.year)) || act.km < 40) return -1;

    let s = 0;
    const n = act.name.toLowerCase();
    const loc = (act.location || '').toLowerCase();
    const rn = race.name.toLowerCase();
    const firstWord = n.split(/\s+/)[0];

    if (n.includes(rn)) s += 120;
    if (loc.includes(rn)) s += 100;
    if (firstWord === rn || rn.includes(firstWord) || firstWord.includes(rn)) s += 100;

    // Garmin location names that differ from results race names
    if (rn === 'antalya' && /meltem|muratpasa|muratpaşa|konyaalti|lara/i.test(`${n} ${loc}`)) s += 120;
    if (rn === 'boston' && /hopkinton/i.test(`${n} ${loc}`)) s += 120;
    if (race.country === 'MLA' && /mellieha|valletta|malta|mdina|sliema|birgu/i.test(`${n} ${loc}`)) s += 110;
    if (rn === 'beer lovers' && /liège|liege/i.test(`${n} ${loc}`)) s += 120;
    if (rn === 'rostock' && /rostock|haedge|stadthafen|nacht/i.test(`${n} ${loc}`)) s += 120;

    if (n.includes('marathon')) s += 20;
    if (act.km >= 41.5 && act.km <= 44) s += 15;

    if (act.lat != null && act.lng != null && race.lat != null && race.lng != null) {
      const d = this.haversineKm(act.lat, act.lng, race.lat, race.lng);
      if (d < 25) s += 150;
      else if (d < 80) s += 100;
      else if (d < 200) s += 40;
      else if (d > 800) s -= 80;
    }

    return s;
  },

  linkRaces(activities, races, overrides = []) {
    const usedActs = new Set();
    const usedRaces = new Set();
    const links = new Map();

    for (const ov of overrides) {
      const race = races.find(r => r.name === ov.race && r.year === ov.year);
      const act = activities.find(a => a.date === ov.date && (!ov.name || a.name.toLowerCase() === ov.name.toLowerCase()));
      if (!race || !act || act.km < 40) continue;
      const raceKey = `${race.name}|${race.year}`;
      usedActs.add(act.id);
      usedRaces.add(raceKey);
      links.set(act.id, {
        raceName: race.name, raceYear: race.year,
        officialTime: race.time, country: race.country, major: !!race.major,
        override: true,
      });
    }

    const MIN_SCORE = 80;
    const pairs = [];
    for (const race of races) {
      const raceKey = `${race.name}|${race.year}`;
      if (usedRaces.has(raceKey)) continue;
      for (const act of activities) {
        if (usedActs.has(act.id)) continue;
        const score = this.raceActivityScore(race, act);
        if (score >= MIN_SCORE) pairs.push({ race, act, score });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    for (const { race, act } of pairs) {
      const raceKey = `${race.name}|${race.year}`;
      if (usedActs.has(act.id) || usedRaces.has(raceKey)) continue;
      usedActs.add(act.id);
      usedRaces.add(raceKey);
      links.set(act.id, {
        raceName: race.name, raceYear: race.year,
        officialTime: race.time, country: race.country, major: !!race.major,
      });
    }

    return activities.map(a => ({ ...a, raceMatch: links.get(a.id) || null }));
  },

  filterActivities(acts, opts) {
    const {
      year = 'all', dateFrom = '', dateTo = '', type = 'all',
      minKm = 0, minElev = 0, search = '',
    } = opts;

    return acts.filter(a => {
      if (year !== 'all' && !a.date.startsWith(year)) return false;
      if (dateFrom && a.date < dateFrom) return false;
      if (dateTo && a.date > dateTo) return false;
      if (type !== 'all' && a.type !== type) return false;
      if (minKm > 0 && a.km < minKm) return false;
      if (minElev > 0 && (a.elevGain || 0) < minElev) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.name.toLowerCase().includes(q)
          && !(a.location || '').toLowerCase().includes(q)
          && !a.type.replace(/_/g, ' ').includes(q)) return false;
      }
      return true;
    });
  },

  paceBadges(list) {
    const buckets = [
      { key: '5k', label: '5K', min: 4.5, max: 5.5 },
      { key: '10k', label: '10K', min: 9.5, max: 10.5 },
      { key: 'hm', label: 'HM', min: 20.5, max: 22 },
      { key: 'm', label: 'M', min: 41, max: 44 },
    ];
    const badges = new Map();
    for (const b of buckets) {
      const pool = list.filter(a => a.paceSec && a.km >= b.min && a.km <= b.max);
      if (!pool.length) continue;
      const best = pool.reduce((a, c) => (c.paceSec < a.paceSec ? c : a));
      badges.set(best.id, b.label);
    }
    return badges;
  },

  personalRecords(list) {
    const buckets = [
      { key: '5k', label: '5K', min: 4.5, max: 5.5 },
      { key: '10k', label: '10K', min: 9.5, max: 10.5 },
      { key: 'hm', label: 'Half Marathon', min: 20.5, max: 22 },
      { key: 'm', label: 'Marathon', min: 41, max: 44 },
    ];
    const bestEfforts = buckets.map(b => {
      const pool = list.filter(a => a.paceSec && a.km >= b.min && a.km <= b.max);
      if (!pool.length) return null;
      const act = pool.reduce((a, c) => (c.paceSec < a.paceSec ? c : a));
      return { label: b.label, act };
    }).filter(Boolean);

    const rows = [...bestEfforts];
    if (list.length) {
      const longest = list.reduce((a, c) => (c.km > a.km ? c : a));
      rows.push({ label: 'Longest Run', act: longest });
    }
    const withElev = list.filter(a => a.elevGain);
    if (withElev.length) {
      const mostElev = withElev.reduce((a, c) => ((c.elevGain || 0) > (a.elevGain || 0) ? c : a));
      rows.push({ label: 'Most Elevation', act: mostElev });
    }

    const garminPrs = list.filter(a => a.isPr).sort((a, b) => b.date.localeCompare(a.date));
    return { rows, garminPrs };
  },

  elevationProfile(list, year = 'all') {
    const withElev = list.filter(a => a.elevGain != null);
    const empty = {
      mode: year === 'all' ? 'annual' : 'monthly',
      labels: [], gain: [], hilly: [],
      totalGain: 0, hillyCount: 0, avgGain: 0, maxGain: 0,
    };
    if (!withElev.length) return empty;

    const hilly = a => (a.elevGain || 0) >= 200;
    const totalGain = withElev.reduce((s, a) => s + a.elevGain, 0);
    const hillyCount = withElev.filter(hilly).length;
    const avgGain = Math.round(totalGain / withElev.length);
    const maxGain = Math.max(...withElev.map(a => a.elevGain));

    if (year === 'all') {
      const byYear = {};
      withElev.forEach(a => {
        const y = a.date.slice(0, 4);
        if (!byYear[y]) byYear[y] = { gain: 0, hilly: 0 };
        byYear[y].gain += a.elevGain;
        if (hilly(a)) byYear[y].hilly++;
      });
      const keys = Object.keys(byYear).sort();
      return {
        mode: 'annual',
        labels: keys,
        gain: keys.map(y => Math.round(byYear[y].gain)),
        hilly: keys.map(y => byYear[y].hilly),
        totalGain: Math.round(totalGain),
        hillyCount,
        avgGain,
        maxGain,
      };
    }

    const monthGain = Array(12).fill(0);
    const monthHilly = Array(12).fill(0);
    withElev.filter(a => a.date.startsWith(year)).forEach(a => {
      const m = Number(a.date.slice(5, 7)) - 1;
      monthGain[m] += a.elevGain;
      if (hilly(a)) monthHilly[m]++;
    });
    const yearGain = monthGain.reduce((s, v) => s + v, 0);
    return {
      mode: 'monthly',
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      gain: monthGain.map(v => Math.round(v)),
      hilly: monthHilly,
      totalGain: Math.round(yearGain),
      hillyCount: monthHilly.reduce((s, v) => s + v, 0),
      avgGain: withElev.filter(a => a.date.startsWith(year)).length
        ? Math.round(yearGain / withElev.filter(a => a.date.startsWith(year)).length)
        : 0,
      maxGain: Math.max(0, ...withElev.filter(a => a.date.startsWith(year)).map(a => a.elevGain)),
    };
  },

  consistencyMetrics(list) {
    if (!list.length) return { streak: 0, avgPerWeek: 0, pctWeeks3: 0, activeWeeks: 0 };

    const dates = [...new Set(list.map(a => a.date))].sort();
    let streak = 1;
    let bestStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const cur = new Date(dates[i]);
      const diff = (cur - prev) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
      if (streak > bestStreak) bestStreak = streak;
    }

    const weekCounts = {};
    list.forEach(a => {
      const d = new Date(a.date);
      const wk = `${d.getUTCFullYear()}-W${Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`;
      weekCounts[wk] = (weekCounts[wk] || 0) + 1;
    });
    const weeks = Object.values(weekCounts);
    const activeWeeks = weeks.length;
    const avgPerWeek = activeWeeks ? list.length / activeWeeks : 0;
    const pctWeeks3 = activeWeeks ? Math.round((weeks.filter(w => w >= 3).length / activeWeeks) * 100) : 0;

    return { streak: bestStreak, avgPerWeek: Math.round(avgPerWeek * 10) / 10, pctWeeks3, activeWeeks };
  },

  longRunCountsByYear(acts, years) {
    const thresholds = [20, 21.1, 30, 42.2];
    return years.map(y => {
      const ya = acts.filter(a => a.date.startsWith(y));
      const row = { year: y, total: ya.length, km: Math.round(ya.reduce((s, a) => s + a.km, 0)) };
      thresholds.forEach(t => { row[`t${String(t).replace('.', '_')}`] = ya.filter(a => a.km >= t).length; });
      return row;
    });
  },

  preMarathonBuild(activities, races, overrides = [], opts = {}) {
    const year = opts.year ?? 'all';
    const limit = opts.limit ?? (year === 'all' ? 12 : 0);
    const linked = this.linkRaces(activities, races, overrides);
    let result = races
      .map(race => {
        const act = linked.find(a => a.raceMatch?.raceName === race.name && a.raceMatch?.raceYear === race.year);
        if (!act) return null;
        const raceDate = new Date(act.date);
        const start = new Date(raceDate);
        start.setDate(start.getDate() - 84);
        const startStr = start.toISOString().slice(0, 10);
        const build = activities.filter(a => a.date >= startStr && a.date < act.date);
        const km = Math.round(build.reduce((s, a) => s + a.km, 0));
        const longRuns20 = build.filter(a => a.km >= 20).length;
        const longRuns30 = build.filter(a => a.km >= 30).length;
        return {
          race: `${race.name} ${race.year}`,
          raceYear: race.year,
          officialTime: race.time,
          raceDate: act.date, garminKm: act.km, garminPace: act.pace,
          buildKm: km, buildRuns: build.length, longRuns20, longRuns30,
        };
      })
      .filter(Boolean);
    if (year !== 'all') result = result.filter(b => String(b.raceYear) === String(year));
    result = result.reverse();
    if (limit > 0) result = result.slice(0, limit);
    return result;
  },

  weekKey(dateStr) {
    const d = new Date(dateStr);
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  },

  weeklyKm(list, opts = {}) {
    const maxWeeks = opts.maxWeeks ?? 52;
    const minKm = opts.minKm ?? 0;
    const map = {};
    list.forEach(a => {
      const k = this.weekKey(a.date);
      map[k] = (map[k] || 0) + a.km;
    });
    let entries = Object.keys(map).sort().map(k => ({ key: k, km: Math.round(map[k]) }));
    if (minKm > 0) entries = entries.filter(e => e.km >= minKm);
    if (maxWeeks > 0) entries = entries.slice(-maxWeeks);
    return { labels: entries.map(e => e.key), data: entries.map(e => e.km) };
  },

  weeksOverKm(list, minKm = 100) {
    const map = {};
    list.forEach(a => {
      const k = this.weekKey(a.date);
      map[k] = (map[k] || 0) + a.km;
    });
    return Object.values(map).filter(km => km >= minKm).length;
  },

  weeksOverKmByYear(list, minKm = 100) {
    const map = {};
    list.forEach(a => {
      const k = this.weekKey(a.date);
      map[k] = (map[k] || 0) + a.km;
    });
    const byYear = {};
    Object.entries(map).forEach(([wk, km]) => {
      if (km < minKm) return;
      const year = wk.slice(0, 4);
      byYear[year] = (byYear[year] || 0) + 1;
    });
    return byYear;
  },

  fmtPaceSec(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  },

  paceDistribution(list) {
    const minSec = 3 * 60 + 45; // 3:45 /km
    const maxSec = 8 * 60;      // 8:00 /km
    const stepSec = 15;
    const bucketCount = (maxSec - minSec) / stepSec;
    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      start: minSec + i * stepSec,
      end: minSec + (i + 1) * stepSec,
      count: 0,
    }));

    const paces = list.filter(a => a.paceSec).map(a => a.paceSec);
    paces.forEach(p => {
      let i = Math.floor((p - minSec) / stepSec);
      if (i < 0) i = 0;
      if (i >= buckets.length) i = buckets.length - 1;
      buckets[i].count++;
    });

    return {
      labels: buckets.map(b => this.fmtPaceSec(b.start)),
      ranges: buckets.map(b => `${this.fmtPaceSec(b.start)}–${this.fmtPaceSec(b.end)}/km`),
      data: buckets.map(b => b.count),
      total: paces.length,
      stepSec,
      minSec,
      maxSec,
    };
  },

  vo2Series(list) {
    const pts = list.filter(a => a.vo2max).slice().reverse();
    return {
      labels: pts.map(a => a.date),
      data: pts.map(a => a.vo2max),
    };
  },

  trainingLoadSeries(list, max = 60) {
    const recent = list.slice(0, max).reverse();
    return {
      labels: recent.map(a => a.date.slice(5)),
      data: recent.map(a => a.trainingLoad || 0),
    };
  },

  monthlyCompare(acts, yearA, yearB) {
    const monthKm = (year) => {
      const arr = Array(12).fill(0);
      acts.filter(a => a.date.startsWith(year)).forEach(a => {
        arr[Number(a.date.slice(5, 7)) - 1] += a.km;
      });
      return arr.map(v => Math.round(v));
    };
    return {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      a: monthKm(yearA),
      b: monthKm(yearB),
    };
  },
};

function actMapTileUrl() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return isLight
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

window.renderActivityMiniMap = function renderActivityMiniMap(containerId, act, opts = {}) {
  const el = document.getElementById(containerId);
  if (!el || !act?.lat || !act?.lng || typeof L === 'undefined') return null;

  if (el._miniMap) {
    el._miniMap.remove();
    el._miniMap = null;
  }
  el.innerHTML = '';

  const zoom = opts.zoom ?? 14;
  const map = L.map(containerId, {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    dragging: !opts.static,
  }).setView([act.lat, act.lng], zoom);

  L.tileLayer(actMapTileUrl(), { attribution: '© CARTO' }).addTo(map);

  const color = act.raceMatch ? '#22c55e' : '#f97316';
  L.circleMarker([act.lat, act.lng], {
    radius: 8, color, fillColor: color, fillOpacity: 0.85, weight: 2,
  }).addTo(map);

  const pts = [[act.lat, act.lng]];
  if (act.endLat && act.endLng) pts.push([act.endLat, act.endLng]);
  if (pts.length > 1) {
    L.polyline(pts, { color: '#f97316', weight: 3, opacity: 0.75 }).addTo(map);
    map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 15 });
  }

  el._miniMap = map;
  setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 80);
  return map;
};

window.openActivityPreview = function openActivityPreview(act) {
  if (!act) return;
  window._actPreviewTarget = act;
  const tl = ActivityUtils.typeLabel(act.type);
  const loc = act.location || (act.lat ? `${act.lat.toFixed(4)}, ${act.lng.toFixed(4)}` : 'No GPS data');

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title">${act.name}</div>
    <div class="modal-subtitle">${act.date} · ${tl}${act.location ? ` · ${act.location}` : ''}</div>
    <div class="modal-time" style="color:#f97316">${act.km} km · ${act.duration} · ${act.pace}/km</div>
    ${act.lat ? '<div class="act-modal-map act-preview-map" id="actPreviewMap"></div>' : `<p style="color:var(--muted);margin-top:12px">${loc}</p>`}
    <div style="margin-top:14px;text-align:center">
      <button type="button" class="act-map-viewer-btn" id="actPreviewDetails">Full activity details</button>
    </div>`;
  document.getElementById('modal').classList.add('open');
  if (act.lat) renderActivityMiniMap('actPreviewMap', act, { zoom: 14 });
  document.getElementById('actPreviewDetails')?.addEventListener('click', () => {
    openActivityModal(window._actPreviewTarget);
  });
};

window.openActivityModal = function openActivityModal(act) {
  const tl = ActivityUtils.typeLabel(act.type);
  const rm = act.raceMatch;
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-title">${act.name}</div>
    <div class="modal-subtitle">${act.date} · ${tl}${act.location ? ` · ${act.location}` : ''}</div>
    <div class="modal-time" style="color:#f97316">${act.km} km · ${act.duration} · ${act.pace}/km</div>
    ${act.isPr ? '<div style="color:#fbbf24;font-weight:700;margin-bottom:8px">⭐ Garmin Personal Record</div>' : ''}
    ${rm ? `<div style="color:#22c55e;font-weight:700;margin-bottom:8px">🏅 Linked: ${rm.raceName} ${rm.raceYear} (${rm.officialTime})</div>` : ''}
    <div class="modal-grid">
      <div class="modal-stat-box"><div class="modal-stat-label">Avg HR</div><div class="modal-stat-val">${act.avgHr || '—'}${act.maxHr ? ` / ${act.maxHr}` : ''}</div></div>
      <div class="modal-stat-box"><div class="modal-stat-label">Elevation</div><div class="modal-stat-val">+${act.elevGain || 0}m${act.elevLoss ? ` / -${act.elevLoss}m` : ''}</div></div>
      <div class="modal-stat-box"><div class="modal-stat-label">Training</div><div class="modal-stat-val">${act.trainingEffect || '—'}${act.trainingLoad ? ` · ${act.trainingLoad}` : ''}</div></div>
      <div class="modal-stat-box"><div class="modal-stat-label">VO₂ Max</div><div class="modal-stat-val">${act.vo2max || '—'}</div></div>
      <div class="modal-stat-box"><div class="modal-stat-label">Calories</div><div class="modal-stat-val">${act.calories ? act.calories.toLocaleString() : '—'}</div></div>
      <div class="modal-stat-box"><div class="modal-stat-label">Power / Cadence</div><div class="modal-stat-val">${act.avgPower ? `${act.avgPower}W` : '—'}${act.cadence ? ` · ${act.cadence} spm` : ''}</div></div>
    </div>
    ${act.lat ? '<div class="act-modal-map" id="actModalMap"></div>' : `<div style="margin-top:12px;color:var(--muted);font-size:0.82rem">📍 No GPS data</div>`}`;
  document.getElementById('modal').classList.add('open');
  if (act.lat) renderActivityMiniMap('actModalMap', act, { zoom: 13 });
};
