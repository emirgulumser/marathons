import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, '..', 'js');

let m = fs.readFileSync(path.join(jsDir, 'marathons-tab.js'), 'utf8');

// Remove theme block
m = m.replace(/\nlet isDark = true;[\s\S]*?^}\n(?=\nChart)/m, '\n');

// Remove switchTab
m = m.replace(/\nfunction switchTab\(name\) \{[\s\S]*?^}\n/m, '\n');

// Remove lat assignment IIFE - find by marker
const latStart = m.indexOf('// City-level latitudes');
if (latStart !== -1) {
  const latEnd = m.indexOf('})();', latStart) + 5;
  m = m.slice(0, latStart - 30) + m.slice(latEnd);
}

// Remove lng assignment IIFE
const lngStart = m.indexOf('const lngs=[');
if (lngStart !== -1) {
  const lngEnd = m.indexOf('})();', lngStart) + 5;
  m = m.slice(0, lngStart - 30) + m.slice(lngEnd);
}

// Remove vol perf sections that belong in training tab (duplicate with wrong logKm)
['TRAINING VOLUME vs BEST MARATHON TIME', 'MARATHONS COUNT vs ANNUAL KM'].forEach(title => {
  const i = m.indexOf(title);
  if (i === -1) return;
  const start = m.lastIndexOf('(', i);
  const end = m.indexOf('})();', i) + 5;
  m = m.slice(0, start) + m.slice(end);
});

// Fix broken globalize on logKm declarations
m = m.replace(/const App\.App\.logKm=\{[\s\S]*?\};/g, '');
m = m.replace(/const App\.logKm=\{[\s\S]*?\};/g, '');

// Fix stats block
m = m.replace(
  "document.getElementById('sKm').textContent    = '2,616';",
  "document.getElementById('sKm').textContent    = Math.round(App.races.length * 42.195).toLocaleString();"
);

if (!m.includes("getElementById('sTotal')")) {
  m = m.replace(
    "document.getElementById('sSub3').textContent  = sub3Count;",
    `document.getElementById('sSub3').textContent  = sub3Count;
document.getElementById('sTotal').textContent = App.races.length;
document.getElementById('sCountries').textContent = App.countryData.length;
document.getElementById('sPB').textContent = fmtTime(Math.min(...App.races.map(r => r.minutes)));
document.getElementById('sMajors').textContent = App.races.filter(r => r.major).length;`
  );
}

m = m.replace(/race\.rank} \/ 62/g, 'race.rank} / ${App.races.length}');
m = m.replace(/race\.minutes-172/g, 'race.minutes-App.stats.pbMinutes');
m = m.replace("ctx.fillText('62', cx, cy - 10);", "ctx.fillText(String(App.races.length), cx, cy - 10);");

m = m.replace(/^function openModal/m, 'window.openModal = function openModal');
m = m.replace(/^function closeModal/m, 'window.closeModal = function closeModal');
m = m.replace(/^function openHeatmapModal/m, 'window.openHeatmapModal = function openHeatmapModal');

fs.writeFileSync(path.join(jsDir, 'marathons-tab.js'), m);

// Fix half-tab
let h = fs.readFileSync(path.join(jsDir, 'half-tab.js'), 'utf8');
h = h.replace(/App\.races/g, 'races');
// Fix the erroneous replacement in legend text - use literal "races"
h = h.replace(/\$\{contCounts\[i\]\} races ·/g, '${contCounts[i]} races ·');

// Remove trailing broken IIFE close and comment
h = h.replace(/\}\)\(\);\s*\n\/\* ═+[\s\S]*$/m, '');

// Ensure half table code is inside the function
if (!h.trimEnd().endsWith('};')) {
  h = h.trimEnd();
  if (!h.endsWith('}')) h += '\n';
  if (!h.endsWith('};')) h += '};';
}

fs.writeFileSync(path.join(jsDir, 'half-tab.js'), h);

// Fix training tab - remove vol perf if duplicated, ensure logKm from App
let t = fs.readFileSync(path.join(jsDir, 'training-tab.js'), 'utf8');
t = t.replace(/const App\.logKm=\{[\s\S]*?\};/g, '');
t = t.replace(/const App\.App\.logKm=\{[\s\S]*?\};/g, '');
fs.writeFileSync(path.join(jsDir, 'training-tab.js'), t);

console.log('Fixed. marathons length:', m.length);
