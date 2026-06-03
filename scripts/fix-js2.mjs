import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, '..', 'js');

function fix(file, transforms) {
  let s = fs.readFileSync(path.join(jsDir, file), 'utf8');
  transforms.forEach(([from, to]) => {
    s = typeof from === 'string' ? s.replace(from, to) : s.replace(from, to);
  });
  fs.writeFileSync(path.join(jsDir, file), s);
}

fix('marathons-tab.js', [
  ['STATS\r\n═══════════════════════════════════════════════════════ */', ''],
  [/\r?\nlet isDark = true;[\s\S]*?function toggleTheme\(\) \{[\s\S]*?\}\r?\n/, '\n'],
  [/\r?\nfunction switchTab\(name\) \{[\s\S]*?\}\r?\n/, '\n'],
  [/App\.App\.logKm/g, 'App.logKm'],
  [/App\.App\./g, 'App.'],
]);

fix('training-tab.js', [
  [/const App\.log = App\.App\.log;/, 'const log = App.log;'],
  [/App\.App\./g, 'App.'],
]);

fix('trail-tab.js', [
  [/const App\.trails = App\.App\.trails;/, 'const trails = App.trails;'],
  [/App\.App\./g, 'App.'],
]);

// Re-append half table code
let h = fs.readFileSync(path.join(jsDir, 'half-tab.js'), 'utf8');
if (!h.includes('renderHalfTable')) {
  const tableCode = `
  const halfCountryMap = {};
  App.countryData.forEach(c => { halfCountryMap[c.code] = c; });

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
    const dir = window.halfSortDir || -1;
    list.sort((a, b) => {
      let av = a[col], bv = b[col];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
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
      <div class="modal-time" style="color:#22c55e">\${r.time}</div>
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
  h = h.replace(/;\s*$/, tableCode + '\n};');
  fs.writeFileSync(path.join(jsDir, 'half-tab.js'), h);
}

// Remove vol perf from marathons if still present (belongs in training)
let m = fs.readFileSync(path.join(jsDir, 'marathons-tab.js'), 'utf8');
['TRAINING VOLUME vs BEST MARATHON TIME', 'MARATHONS COUNT vs ANNUAL KM'].forEach(title => {
  while (m.includes(title)) {
    const i = m.indexOf(title);
    const start = m.lastIndexOf('(function', i);
    const end = m.indexOf('})();', i) + 5;
    if (start >= 0 && end > start) m = m.slice(0, start) + m.slice(end);
    else break;
  }
});
fs.writeFileSync(path.join(jsDir, 'marathons-tab.js'), m);

console.log('fix2 done');
