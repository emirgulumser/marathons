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
