/** Marathon tab chart helpers — finish-time distribution buckets & chart. */
window.MarathonCharts = {
  BIN_MINUTES: 5,

  binColor(minMin) {
    if (minMin < 175) return '#fbbf24';
    if (minMin < 180) return '#22c55e';
    if (minMin < 190) return '#86efac';
    if (minMin < 210) return '#3b82f6';
    if (minMin < 225) return '#a78bfa';
    if (minMin < 240) return '#f97316';
    return '#ef4444';
  },

  racePointColor(r) {
    if (r.isPB) return '#fbbf24';
    if (r.major) return '#a78bfa';
    if (r.minutes < 180) return '#22c55e';
    if (r.minutes >= 240) return '#ef4444';
    return '#3b82f6';
  },

  binRangeLabel(min, max) {
    return `${fmtTime(min)}–${fmtTime(max - 1)}`;
  },

  buildTimeBuckets(races, bin = 5) {
    const times = races.map(r => r.minutes).filter(m => m != null).sort((a, b) => a - b);
    if (!times.length) return null;
    const lo = Math.floor(Math.min(...times) / bin) * bin;
    const hi = Math.ceil((Math.max(...times) + 0.001) / bin) * bin;
    const buckets = [];
    for (let min = lo; min < hi; min += bin) {
      buckets.push({
        min,
        max: min + bin,
        label: this.binRangeLabel(min, min + bin),
        center: min + bin / 2,
      });
    }
    const racesByBin = buckets.map(b =>
      races.filter(r => r.minutes >= b.min && r.minutes < b.max)
    );
    const counts = racesByBin.map(list => list.length);
    const mid = Math.floor(times.length / 2);
    const median = times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
    return { buckets, racesByBin, counts, times, median, lo, hi, bin };
  },

  /** Map finish minutes onto category-axis fractional index. */
  minutesToBucketX(buckets, minutes) {
    if (!buckets.length || minutes == null) return 0;
    const lo = buckets[0].min;
    const hi = buckets[buckets.length - 1].max;
    if (minutes <= lo) return 0;
    if (minutes >= hi) return buckets.length - 1;
    for (let i = 0; i < buckets.length - 1; i++) {
      const b = buckets[i];
      const next = buckets[i + 1];
      if (minutes >= b.min && minutes < next.min) {
        const span = next.min - b.min || 5;
        return i + (minutes - b.min) / span;
      }
    }
    return buckets.length - 1;
  },

  binForMinutes(buckets, minutes) {
    return buckets.find(b => minutes >= b.min && minutes < b.max) || null;
  },

  initDistChart({ canvas, races, chartOpts, onFilterChange, onRaceClick }) {
    const built = this.buildTimeBuckets(races, this.BIN_MINUTES);
    if (!built) return null;
    const { buckets, racesByBin, counts, median } = built;
    const pointColors = buckets.map(b => this.binColor(b.min));
    const medianX = this.minutesToBucketX(buckets, median);

    const rugData = races.map(r => ({
      x: this.minutesToBucketX(buckets, r.minutes),
      y: 0.15,
      race: r,
    }));

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [
          {
            label: 'Races per 5 min',
            data: counts,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.12)',
            borderWidth: 2.5,
            fill: true,
            tension: 0,
            spanGaps: false,
            pointBackgroundColor: pointColors,
            pointBorderColor: pointColors,
            pointRadius: counts.map(n => (n > 0 ? 5 : 0)),
            pointHoverRadius: 8,
            pointHitRadius: 14,
            order: 1,
          },
          {
            type: 'scatter',
            label: 'Each race',
            data: rugData,
            showLine: false,
            pointBackgroundColor: rugData.map(d => this.racePointColor(d.race)),
            pointBorderColor: rugData.map(d => this.racePointColor(d.race)),
            pointRadius: 4,
            pointHoverRadius: 7,
            pointHitRadius: 10,
            parsing: false,
            order: 0,
          },
        ],
      },
      options: {
        ...chartOpts(),
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        onClick(e, els) {
          if (!els.length) {
            onFilterChange?.(null);
            return;
          }
          const dsIdx = els[0].datasetIndex;
          if (dsIdx === 1) {
            const race = rugData[els[0].index]?.race;
            if (race) onRaceClick?.(race);
            return;
          }
          const b = buckets[els[0].index];
          onFilterChange?.({ min: b.min, max: b.max, label: b.label });
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 12,
            filter(item) {
              if (!item?.dataset) return false;
              if (item.dataset.label === 'Each race') return true;
              return typeof item.raw === 'number' && item.raw > 0;
            },
            callbacks: {
              title(items) {
                const item = items?.[0];
                if (!item?.dataset) return '';
                if (item.dataset.label === 'Each race') {
                  const r = rugData[item.dataIndex]?.race;
                  return r ? `${r.name} ${r.year}` : '';
                }
                const b = buckets[item.dataIndex];
                return b?.label ?? '';
              },
              label(item) {
                if (!item?.dataset) return '';
                if (item.dataset.label === 'Each race') {
                  const r = rugData[item.dataIndex]?.race;
                  return r ? ` ${r.time}` : '';
                }
                return ` ${item.raw} race${item.raw !== 1 ? 's' : ''}`;
              },
              afterBody(items) {
                const item = items?.[0];
                if (!item?.dataset) return [];
                if (item.dataset.label === 'Each race') return [];
                const list = racesByBin[item.dataIndex] || [];
                if (!list.length) return [];
                const names = list
                  .slice()
                  .sort((a, b) => a.minutes - b.minutes)
                  .map(r => `${r.name} ${r.year} (${r.time})`);
                if (names.length <= 5) return ['', ...names];
                return ['', ...names.slice(0, 4), `… +${names.length - 4} more`];
              },
            },
          },
          annotation: {
            annotations: {
              medianLine: {
                type: 'line',
                xMin: medianX,
                xMax: medianX,
                borderColor: '#fbbf24',
                borderWidth: 2.5,
                borderDash: [6, 4],
                label: {
                  display: true,
                  content: `Median ${fmtTime(Math.round(median))}`,
                  position: 'start',
                  backgroundColor: 'rgba(15,23,42,0.75)',
                  color: '#fbbf24',
                  font: { size: 11, weight: '600' },
                  padding: 4,
                },
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#8b949e',
              font: { size: 9 },
              maxRotation: 45,
              minRotation: 45,
              autoSkip: false,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#8b949e', stepSize: 1 },
            title: { display: true, text: 'Races', color: '#8b949e', font: { size: 11 } },
          },
        },
      },
    });

    return { chart, buckets, pointColors, counts, rugData };
  },

  refreshDistHighlight(state, active) {
    const { chart, buckets, pointColors, counts } = state;
    if (!chart) return;
    chart.data.datasets[0].pointBackgroundColor = pointColors.map((c, i) => {
      if (!active) return c;
      return (buckets[i].min === active.min && buckets[i].max === active.max) ? c : c + '44';
    });
    chart.data.datasets[0].pointRadius = pointColors.map((_, i) => {
      if (!active) return counts[i] > 0 ? 5 : 0;
      return (buckets[i].min === active.min && buckets[i].max === active.max) ? 8 : (counts[i] > 0 ? 4 : 0);
    });
    chart.update();
  },
};
