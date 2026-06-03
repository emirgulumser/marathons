import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, '..', 'js');

function clean(file) {
  let s = fs.readFileSync(path.join(jsDir, file), 'utf8');
  // Remove orphaned comment fragments from bad splits
  s = s.replace(/^[A-Z][A-Z\s]+\n═+\s*\*\/\n/gm, '');
  s = s.replace(/\/\* ═+[\s\S]*?═+ \*\/\n?/g, '');
  fs.writeFileSync(path.join(jsDir, file), s);
}

['marathons-tab.js', 'half-tab.js', 'training-tab.js', 'trail-tab.js'].forEach(clean);

// marathons-tab fixes
let m = fs.readFileSync(path.join(jsDir, 'marathons-tab.js'), 'utf8');

// Remove theme toggle block (moved to theme.js)
m = m.replace(/let isDark = true;[\s\S]*?^}\n\n/m, '');

// Remove switchTab (moved to tabs.js)
m = m.replace(/function switchTab\(name\) \{[\s\S]*?\}\n\n/m, '');

// Remove duplicate lat/lng assignment - races already have lat/lng from JSON
m = m.replace(/\(function\(\) \{\s*\/\/ City-level latitudes[\s\S]*?r\.lat = lats\[i\];[\s\S]*?\}\)\(\);\s*\n\n/m, '');

// Remove duplicate lng assignment
m = m.replace(/\(function\(\)\{\s*const lngs=\[[\s\S]*?App\.races\.forEach\(\(r,i\)=>\{ r\.lng=lngs\[i\]; \}\);[\s\S]*?\}\)\(\);\s*\n\n/m, '');

// Remove vol perf duplicate logKm blocks (training tab owns these charts... wait they're in marathons2 section)
// Actually volPerfChart and racesKmChart are in marathons tab HTML under training section - they're in trainingRaw cut
// But grep found them in marathons-tab - they're in marathons2 (latitude section includes them?)

// Fix hardcoded stats
const marathonKm = 'Math.round(App.races.length * 42.195).toLocaleString()';
m = m.replace(
  "document.getElementById('sKm').textContent    = '2,616';",
  `document.getElementById('sKm').textContent    = ${marathonKm};`
);

// Fix dynamic stat cards in stats grid
m = m.replace(
  /<div class="stat-value">62<\/div><div class="stat-label">Total Marathons<\/div>/,
  ''
);
// Stats grid is in HTML not JS - update via JS instead
m = m.replace(
  "document.getElementById('sSub3').textContent  = sub3Count;",
  `document.getElementById('sSub3').textContent  = sub3Count;
const pbMin = Math.min(...App.races.map(r => r.minutes));
document.getElementById('sTotal').textContent = App.races.length;
document.getElementById('sCountries').textContent = App.countryData.length;
document.getElementById('sPB').textContent = fmtTime(pbMin);
document.getElementById('sMajors').textContent = App.races.filter(r => r.major).length;`
);

// Fix modal hardcoded values
m = m.replace(/race\.rank} \/ 62/g, 'race.rank} / ${App.races.length}');
m = m.replace(/race\.minutes-172/g, 'race.minutes-App.stats.pbMinutes');

// Fix continent chart hardcoded 62
m = m.replace("ctx.fillText('62', cx, cy - 10);", "ctx.fillText(String(App.races.length), cx, cy - 10);");

// Remove duplicate logKm inline objects - use App.logKm
m = m.replace(/const logKm=\{[\s\S]*?\};\n/g, '');
m = m.replace(/const logKm2=\{[\s\S]*?\};\n/g, '');

// Move openModal/closeModal/openHeatmapModal to window for global access
m = m.replace(/^function openModal/m, 'window.openModal = function openModal');
m = m.replace(/^function closeModal/m, 'window.closeModal = function closeModal');
m = m.replace(/^function openHeatmapModal/m, 'window.openHeatmapModal = function openHeatmapModal');

// Expose chart helpers and state for theme
m = m.replace(
  'let activeCountryFilter = null;',
  'window.activeCountryFilter = null;\nlet activeCountryFilter = window.activeCountryFilter;'
);
// Actually activeCountryFilter is reassigned - need window.activeCountryFilter everywhere or use App.activeCountryFilter

fs.writeFileSync(path.join(jsDir, 'marathons-tab.js'), m);

// half-tab: add table rendering at end
let h = fs.readFileSync(path.join(jsDir, 'half-tab.js'), 'utf8');

// Remove duplicate theme listener on half map
h = h.replace(/document\.getElementById\('themeBtn'\)\.addEventListener[\s\S]*?\}\);\s*\n/m, '');

const halfTableCode = `
  // ── Half marathon race table ─────────────────────────
  const halfCountryMap = {};
  App.countryData.forEach(c => { halfCountryMap[c.code] = c; });
  App.halfCountryMap = halfCountryMap;

  function renderHalfTable() {
    let list = [...halfRaces];
    const q = (document.getElementById('halfSearchInput')?.value || '').toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (halfCountryMap[r.country]?.name || '').toLowerCase().includes(q)
      );
    }
    const col = window.halfSortCol || 'year';
    const dir = window.halfSortDir || 1;
    list.sort((a, b) => {
      let av = a[col], bv = b[col];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    const tbody = document.getElementById('halfRacesBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach((r, i) => {
      const c = halfCountryMap[r.country] || { name: r.country };
      const tr = document.createElement('tr');
      tr.onclick = () => window.openHalfModal(r);
      tr.innerHTML = \`
        <td style="color:var(--muted)">\${i + 1}</td>
        <td><span class="cell-flag-label">\${flagImgHtml(r.country, 18)}<span>\${r.name}\${r.isPB ? ' 🏆' : ''}</span></span></td>
        <td>\${r.year}</td>
        <td><span class="cell-flag-label">\${flagImgHtml(r.country, 22)}<span>\${c.name}</span></span></td>
        <td class="time-cell \${r.minutes < 90 ? 'sub3' : r.minutes < 95 ? 'fast' : ''}">\${r.time}</td>
        <td style="color:var(--muted);font-size:0.8rem">#\${r.rank} fastest</td>\`;
      tbody.appendChild(tr);
    });
  }

  window.openHalfModal = function(r) {
    const c = halfCountryMap[r.country] || { name: r.country };
    document.getElementById('modalContent').innerHTML = \`
      <div class="modal-flag">\${flagImgHtml(r.country, 48)}</div>
      <div class="modal-title">\${r.name}</div>
      <div class="modal-subtitle">\${r.year} · \${c.name} · Half Marathon</div>
      <div class="modal-time" style="color:\${timeColor(r.minutes / 2)}">\${r.time}</div>
      \${r.isPB ? '<div style="color:#fbbf24;font-weight:700;margin-bottom:8px">🏆 Personal Best!</div>' : ''}
      <div class="modal-grid">
        <div class="modal-stat-box"><div class="modal-stat-label">Overall Rank</div><div class="modal-stat-val">#\${r.rank} / \${halfRaces.length}</div></div>
        <div class="modal-stat-box"><div class="modal-stat-label">Pace / km</div><div class="modal-stat-val">\${fmtTime(Math.round(r.minutes / 21.0975))}</div></div>
      </div>\`;
    document.getElementById('modal').classList.add('open');
  };

  window.halfSortCol = 'year';
  window.halfSortDir = -1;
  document.querySelectorAll('#halfTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      window.halfSortDir = window.halfSortCol === col ? window.halfSortDir * -1 : 1;
      window.halfSortCol = col;
      renderHalfTable();
    });
  });
  document.getElementById('halfSearchInput')?.addEventListener('input', renderHalfTable);
  renderHalfTable();

  const halfPB = Math.min(...halfRaces.map(r => r.minutes));
  const halfSub130 = halfRaces.filter(r => r.minutes < 90).length;
  document.getElementById('halfStats').innerHTML = \`
    <div class="stat-card c-blue"><div class="stat-icon">½</div><div class="stat-value">\${totalRaces}</div><div class="stat-label">Half Marathons</div></div>
    <div class="stat-card c-gold"><div class="stat-icon">⚡</div><div class="stat-value">\${fmtTime(halfPB)}</div><div class="stat-label">Personal Best</div></div>
    <div class="stat-card c-green"><div class="stat-icon">🟢</div><div class="stat-value">\${halfSub130}</div><div class="stat-label">Sub-1:30</div></div>
    <div class="stat-card c-teal"><div class="stat-icon">📏</div><div class="stat-value">\${totalKm}</div><div class="stat-label">Total km</div></div>\`;
`;

// Replace original halfStats innerHTML block
h = h.replace(
  /document\.getElementById\('halfStats'\)\.innerHTML = `[\s\S]*?`;/,
  '// halfStats rendered after table setup'
);

if (!h.includes('renderHalfTable')) {
  h = h.replace(/\};\s*$/, halfTableCode + '\n};');
}

fs.writeFileSync(path.join(jsDir, 'half-tab.js'), h);

console.log('Post-process done');
