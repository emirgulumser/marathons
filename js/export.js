/** CSV export for race data. */
function downloadCSV(filename, rows) {
  const csv = rows.map(row =>
    row.map(cell => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

window.exportMarathonsCSV = function exportMarathonsCSV() {
  const rows = [
    ['#', 'Race', 'Year', 'Country', 'Time', 'Major', 'Rank'],
    ...App.races.map(r => [
      r.idx, r.name, r.year, r.country, r.time, r.major ? 'Yes' : 'No', r.rank,
    ]),
  ];
  downloadCSV('marathons.csv', rows);
};

window.exportHalfCSV = function exportHalfCSV() {
  const rows = [
    ['#', 'Race', 'Year', 'Country', 'Time', 'Rank'],
    ...App.halfRaces.map((r, i) => [
      i + 1, r.name, r.year, r.country, r.time, r.rank || '',
    ]),
  ];
  downloadCSV('half-marathons.csv', rows);
};

window.exportTrainingCSV = function exportTrainingCSV() {
  const rows = [
    ['Year', 'Km', 'Runs', 'Moving Time', 'Avg km/run'],
    ...App.log.map(d => [d.year, d.km, d.runs, d.time, d.avgKm]),
  ];
  downloadCSV('training-log.csv', rows);
};

window.exportActivitiesCSV = function exportActivitiesCSV() {
  const U = window.ActivitiesUtils;
  const list = U ? U.filterActivities(App.activities || [], U.getFilters()) : (App.activities || []);
  const rows = [
    ['Date', 'Name', 'Type', 'Distance (km)', 'Duration (sec)', 'Pace (min/km)', 'Location', 'Avg HR', 'Max HR', 'Elevation (m)', 'Calories', 'Race tag', 'Garmin URL'],
    ...list.map(a => [
      a.date, a.name, a.type, a.distKm, a.durationSec, a.paceMinKm ?? '',
      a.location ?? '', a.avgHr ?? '', a.maxHr ?? '', a.elevGainM ?? '', a.calories ?? '',
      a.raceTag ?? '', a.garminUrl ?? '',
    ]),
  ];
  downloadCSV('garmin-activities.csv', rows);
};

window.exportMarathonBlocksCSV = function exportMarathonBlocksCSV() {
  const blocks = window._marathonBlocksExport || [];
  const rows = [
    ['Race', 'Year', 'Race day', 'Finish', 'Block km', 'Runs', '>20 km', '>30 km', 'Longest km', 'Avg/wk', 'Peak wk km', 'Wks ≥50', 'Wks ≥80', 'Wks ≥100', 'Hard runs'],
    ...blocks.map(b => [
      b.raceName, b.raceYear, b.raceDate, b.raceTime, b.totalKm, b.runCount,
      b.runsOver20, b.runsOver30, b.longest?.distKm ?? '', b.avgWeeklyKm,
      b.peakWeek?.km ?? '', b.weeksOver50, b.weeksOver80, b.weeksOver100, b.hardRuns,
    ]),
  ];
  downloadCSV('marathon-training-blocks.csv', rows);
};
