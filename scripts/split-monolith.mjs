import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].trim();
fs.mkdirSync(path.join(root, 'css'), { recursive: true });
fs.writeFileSync(path.join(root, 'css', 'styles.css'), css);

const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function idx(label) {
  const i = js.indexOf(label);
  if (i === -1) throw new Error(`Label not found: ${label}`);
  return i;
}

const cut = (startLabel, endLabel) => {
  const start = idx(startLabel);
  const end = endLabel ? idx(endLabel) : js.length;
  return js.slice(start, end).trim();
};

const helpers = cut('   HELPERS', 'const countryMap = {}').replace(/^[\s\S]*?HELPERS[\s\S]*?\*\/\n?/, '');
const marathons1 = cut('   STATS', '   HALF MARATHON');
const halfRaw = cut('   HALF MARATHON', '   ANNUAL TRAINING LOG');
const trainingRaw = cut('   ANNUAL TRAINING LOG', '   LATITUDE CHARTS');
const marathons2 = cut('   LATITUDE CHARTS', '   TRAIL RACES');
const trailRaw = cut('   TRAIL RACES', null);

function globalize(code) {
  return code
    .replace(/\bcountryMap\b/g, 'App.countryMap')
    .replace(/\bcountryData\b/g, 'App.countryData')
    .replace(/\blogKm2\b/g, 'App.logKm')
    .replace(/\blogKm\b/g, 'App.logKm')
    .replace(/\btrails\b/g, 'App.trails')
    .replace(/\blog\b/g, 'App.log')
    .replace(/\braces\b/g, 'App.races');
}

const enrich = `
let pb = Infinity;
App.races.forEach((r, i) => {
  r.idx = i + 1;
  r.minutes = parseTime(r.time);
  r.isPB = r.minutes < pb;
  if (r.isPB) pb = r.minutes;
});
const sortedByTime = [...App.races].sort((a, b) => a.minutes - b.minutes);
App.races.forEach(r => { r.rank = sortedByTime.indexOf(r) + 1; });
App.countryMap = {};
App.countryData.forEach(c => { App.countryMap[c.code] = c; });
const races = App.races;
const countryData = App.countryData;
const countryMap = App.countryMap;
const log = App.log;
const logKm = App.logKm;
const logKm2 = App.logKm;
`;

const jsDir = path.join(root, 'js');
fs.mkdirSync(jsDir, { recursive: true });

fs.writeFileSync(path.join(jsDir, 'utils.js'), helpers);

const stripHeader = (s) => s.replace(/^\/\*[\s\S]*?\*\/\n?/, '');

const marathonsTab = `window.initMarathonsTab = function () {
  if (window._marathonsTabInit) return;
  window._marathonsTabInit = true;
${enrich}
${globalize(stripHeader(marathons1))}
${globalize(stripHeader(marathons2))}
};`;
fs.writeFileSync(path.join(jsDir, 'marathons-tab.js'), marathonsTab);

let halfCode = stripHeader(halfRaw)
  .replace(/\(function\(\)\{\s*/, '')
  .replace(/\}\)\(\);\s*$/, '')
  .replace(
    /const halfData = \[[\s\S]*?\];/,
    `const halfRaces = App.halfRaces;
  halfRaces.forEach((r, i) => {
    r.idx = i + 1;
    r.minutes = parseTime(r.time);
    r.city = r.name;
  });
  let hpb = Infinity;
  halfRaces.forEach(r => {
    r.isPB = r.minutes < hpb;
    if (r.isPB) hpb = r.minutes;
  });
  const sortedHalf = [...halfRaces].sort((a, b) => a.minutes - b.minutes);
  halfRaces.forEach(r => { r.rank = sortedHalf.indexOf(r) + 1; });
  const halfData = [];
  halfRaces.forEach(r => {
    let g = halfData.find(d => d.city === r.name && d.country === r.country);
    if (!g) {
      g = { city: r.name, country: r.country, count: 0, lat: r.lat, lng: r.lng };
      halfData.push(g);
    }
    g.count++;
  });`
);

fs.writeFileSync(
  path.join(jsDir, 'half-tab.js'),
  `window.initHalfTab = function () {
  if (window._halfTabInit) return;
  window._halfTabInit = true;
${globalize(halfCode)}
};`
);

let trainingCode = stripHeader(trainingRaw)
  .replace(/\(function\(\) \{\s*/, '')
  .replace(/\}\)\(\);\s*$/, '')
  .replace(/const log = \[[\s\S]*?\];/, 'const log = App.log;')
  .replace(/const logKm=\{[\s\S]*?\};/g, '')
  .replace(/const logKm2=\{[\s\S]*?\};/g, '');

fs.writeFileSync(
  path.join(jsDir, 'training-tab.js'),
  `window.initTrainingTab = function () {
  if (window._trainingTabInit) return;
  window._trainingTabInit = true;
  const logKm = App.logKm;
  const logKm2 = App.logKm;
  const races = App.races;
${globalize(trainingCode)}
};`
);

let trailCode = stripHeader(trailRaw).replace(/const trails = \[[\s\S]*?\];/, 'const trails = App.trails;');

fs.writeFileSync(
  path.join(jsDir, 'trail-tab.js'),
  `window.initTrailTab = function () {
  if (window._trailTabInit) return;
  window._trailTabInit = true;
${globalize(trailCode)}
};`
);

console.log('Split OK:', {
  utils: helpers.length,
  marathons: marathonsTab.length,
  half: halfCode.length,
  training: trainingCode.length,
  trail: trailCode.length,
});
