/** Load JSON data, enrich records, compute derived stats. */
window.App = {
  races: [],
  halfRaces: [],
  trails: [],
  log: [],
  logKm: {},
  countryData: [],
  countryMap: {},
  goals: null,
  activities: [],
  activityMeta: null,
  activitySummary: null,
  stats: {},
};

function dataUrl(path) {
  return new URL(path, window.APP_ROOT || document.baseURI).href;
}

async function loadJSON(path) {
  const url = dataUrl(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json();
}

function enrichTrails(trails) {
  trails.forEach(t => {
    const parts = t.time.split(':').map(Number);
    t.minutes = parts[0] * 60 + parts[1];
    t.pacePerKm = t.minutes / t.dist;
  });
  return trails;
}

function enrichTraining(log) {
  log.forEach(d => {
    const [h, m, s] = d.time.split(':').map(Number);
    d.hours = h + m / 60 + s / 3600;
    d.avgKm = parseFloat((d.km / d.runs).toFixed(2));
  });
  return log;
}

function enrichRaces(races) {
  let pb = Infinity;
  races.forEach((r, i) => {
    r.idx = i + 1;
    r.minutes = parseTime(r.time);
    r.isPB = r.minutes < pb;
    if (r.isPB) pb = r.minutes;
  });
  const sortedByTime = [...races].sort((a, b) => a.minutes - b.minutes);
  races.forEach(r => { r.rank = sortedByTime.indexOf(r) + 1; });
  return pb;
}

function computeStats() {
  enrichRaces(App.races);
  const { races, log, trails, halfRaces } = App;
  const pbMinutes = Math.min(...races.map(r => r.minutes));

  App.stats = {
    marathonCount: races.length,
    countryCount: App.countryData.length,
    pbMinutes,
    pbTime: fmtTime(pbMinutes),
    sub3Count: races.filter(r => r.minutes < 180).length,
    majorsComplete: races.filter(r => r.major).length,
    marathonKm: Math.round(races.length * 42.195),
    totalTrainingKm: log.reduce((s, d) => s + d.km, 0),
    trailCount: trails.length,
    halfCount: halfRaces.length,
  };

  App.logKm = {};
  log.forEach(d => { App.logKm[d.year] = d.km; });
}

window.loadAppData = async function loadAppData() {
  const [marathons, countries, halfRaces, trails, log, goals] = await Promise.all([
    loadJSON('data/marathons.json'),
    loadJSON('data/countries.json'),
    loadJSON('data/half-marathons.json'),
    loadJSON('data/trails.json'),
    loadJSON('data/training.json'),
    loadJSON('data/goals.json'),
  ]);

  App.races = marathons;
  App.halfRaces = halfRaces;
  App.trails = enrichTrails(trails);
  App.log = enrichTraining(log);
  App.goals = goals;
  App.countryData = countries
    .map(c => ({ ...c, count: marathons.filter(r => r.country === c.code).length }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  computeStats();
  return App;
};

window.loadActivities = async function loadActivities() {
  if (App._activitiesLoaded) return App;
  try {
    const payload = await loadJSON('data/activities.json');
    App.activityMeta = payload.meta || null;
    App.activities = payload.activities || [];
    App.activitySummary = payload.summary || null;
  } catch {
    App.activityMeta = null;
    App.activities = [];
    App.activitySummary = null;
  }
  App._activitiesLoaded = true;
  return App;
};
