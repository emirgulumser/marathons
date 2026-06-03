import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const bodyMatch = html.match(/<body>([\s\S]*)<\/script>\s*<\/body>/);
let b = bodyMatch[1].replace(/<script>[\s\S]*/, '').trim();

b = b
  .replace(
    '<p>62 marathons · 20 countries · 35,903 km · 6 World Majors</p>',
    '<p id="headerTagline">Loading…</p>'
  )
  .replace(
    '<div class="stat-value">62</div><div class="stat-label">Total Marathons</div>',
    '<div class="stat-value" id="sTotal">—</div><div class="stat-label">Total Marathons</div>'
  )
  .replace(
    '<div class="stat-value">20</div><div class="stat-label">Countries</div>',
    '<div class="stat-value" id="sCountries">—</div><div class="stat-label">Countries</div>'
  )
  .replace(
    '<div class="stat-value">2:52</div><div class="stat-label">Personal Best</div>',
    '<div class="stat-value" id="sPB">—</div><div class="stat-label">Personal Best</div>'
  )
  .replace(
    '<div class="stat-value">6</div><div class="stat-label">World Majors</div>',
    '<div class="stat-value" id="sMajors">—</div><div class="stat-label">World Majors</div>'
  )
  .replace(
    'Performance Timeline — all 62 races',
    '<span id="timelineTitle">Performance Timeline</span>'
  )
  .replace('Country Passport — 19 nations', '<span id="passportTitle">Country Passport</span>')
  .replace(
    '🏅 62 Marathons &nbsp;·&nbsp; ⛰️ 7 Trail Races &nbsp;·&nbsp; 🌍 20 Countries &nbsp;·&nbsp; 📏 35,903 km total',
    'Loading…'
  );

b = b.replace(
  '</div>\n\n  <!-- PROGRESS TIMELINE -->',
  `</div>

  <!-- GOALS -->
  <div class="section">
    <div class="section-title">Goals & Milestones</div>
    <div class="chart-card">
      <div class="goals-grid" id="goalsGrid"></div>
    </div>
  </div>

  <!-- PROGRESS TIMELINE -->`
);

b = b.replace(
  '<input class="search-input" id="searchInput"',
  '<button class="export-btn" onclick="exportMarathonsCSV()" title="Export CSV">⬇ CSV</button>\n        <input class="search-input" id="searchInput"'
);

b = b.replace(
  '</div><!-- /tab-half -->',
  `  <!-- HALF MARATHON TABLE -->
  <div class="section">
    <div class="section-title">All Half Marathons</div>
    <div class="chart-card">
      <div class="table-controls">
        <button class="export-btn" onclick="exportHalfCSV()" title="Export CSV">⬇ CSV</button>
        <input class="search-input" id="halfSearchInput" type="text" placeholder="Search race or country…">
      </div>
      <div class="table-wrap">
        <table id="halfTable">
          <thead>
            <tr>
              <th data-col="idx">#</th>
              <th data-col="name">Race</th>
              <th data-col="year">Year</th>
              <th data-col="country">Country</th>
              <th data-col="time">Time</th>
              <th data-col="rank">Rank</th>
            </tr>
          </thead>
          <tbody id="halfRacesBody"></tbody>
        </table>
      </div>
    </div>
  </div>

</div><!-- /tab-half -->`
);

b = b.replace(
  '<div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px" id="trainStats"></div>',
  `<div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="export-btn" onclick="exportTrainingCSV()">⬇ Export Training CSV</button></div>
  <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:24px" id="trainStats"></div>`
);

b = b.replace('<footer>', '<footer id="footerStats">');

const out = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Marathon & Running Log</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3.0.1/dist/chartjs-plugin-annotation.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
${b}
<script src="js/utils.js"></script>
<script src="js/store.js"></script>
<script src="js/theme.js"></script>
<script src="js/tabs.js"></script>
<script src="js/export.js"></script>
<script src="js/goals.js"></script>
<script src="js/marathons-tab.js"></script>
<script src="js/half-tab.js"></script>
<script src="js/training-tab.js"></script>
<script src="js/trail-tab.js"></script>
<script src="js/app.js"></script>
</body>
</html>`;

fs.writeFileSync('index.new.html', out);
console.log('Written index.new.html');
