/** Parse marathon GPX and render Garmin-style synced charts in the activity modal. */

window.activityHasGpx = function activityHasGpx(a) {
  return !!trackForActivity?.(a);
};

window.gpxIconHtml = function gpxIconHtml(a) {
  if (!activityHasGpx(a)) return '<span class="gpx-cell gpx-cell--empty" aria-hidden="true"></span>';
  return `<span class="gpx-cell" title="GPX route available" aria-label="GPX available">
    <svg class="gpx-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/>
      <path fill="currentColor" d="M4 20h16v2H4z" opacity=".35"/>
    </svg>
  </span>`;
};

function gpxHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtElapsed(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function fmtPaceMin(minPerKm) {
  if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm <= 0) return '—';
  const total = Math.round(minPerKm * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function smoothSeries(values, window = 7) {
  const out = values.slice();
  const half = Math.floor(window / 2);
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      if (values[j] == null) continue;
      sum += values[j];
      n += 1;
    }
    if (n) out[i] = sum / n;
  }
  return out;
}

window.parseGpxSeries = function parseGpxSeries(xml, opts = {}) {
  const maxPoints = opts.maxPoints ?? 700;
  const raw = [];
  const re = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let m;
  while ((m = re.exec(xml)) != null) {
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const block = m[3];
    const eleM = block.match(/<ele>([^<]*)<\/ele>/i);
    const timeM = block.match(/<time>([^<]*)<\/time>/i);
    const hrM = block.match(/<(?:[\w.]+:)?hr>([^<]*)<\/(?:[\w.]+:)?hr>/i);
    const cadM = block.match(/<(?:[\w.]+:)?cad>([^<]*)<\/(?:[\w.]+:)?cad>/i);
    const t = timeM ? Date.parse(timeM[1]) : NaN;
    raw.push({
      lat,
      lng,
      ele: eleM && eleM[1] !== '' ? parseFloat(eleM[1]) : null,
      t: Number.isFinite(t) ? t : null,
      hr: hrM ? parseFloat(hrM[1]) : null,
      cad: cadM ? parseFloat(cadM[1]) : null,
    });
  }
  if (raw.length < 2) return null;

  const t0 = raw.find(p => p.t != null)?.t ?? 0;
  let distKm = 0;
  const built = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) distKm += gpxHaversineKm(raw[i - 1].lat, raw[i - 1].lng, p.lat, p.lng);
    let pace = null;
    if (i > 0 && p.t != null && raw[i - 1].t != null) {
      const dKm = gpxHaversineKm(raw[i - 1].lat, raw[i - 1].lng, p.lat, p.lng);
      const dtMin = (p.t - raw[i - 1].t) / 60000;
      if (dKm > 0.0005 && dtMin > 0) {
        pace = dtMin / dKm;
        if (pace < 2.5 || pace > 15) pace = null;
      }
    }
    const elapsedSec = p.t != null ? (p.t - t0) / 1000 : i;
    built.push({
      elapsedSec,
      distKm: Math.round(distKm * 1000) / 1000,
      ele: Number.isFinite(p.ele) ? p.ele : null,
      pace,
      hr: Number.isFinite(p.hr) ? p.hr : null,
      cad: Number.isFinite(p.cad) ? (p.cad < 120 ? p.cad * 2 : p.cad) : null,
    });
  }

  const paces = smoothSeries(built.map(p => p.pace), 9);
  built.forEach((p, i) => { p.pace = paces[i]; });

  let series = built;
  if (series.length > maxPoints) {
    const step = Math.ceil(series.length / maxPoints);
    const sparse = [];
    for (let i = 0; i < series.length; i += step) sparse.push(series[i]);
    const last = series[series.length - 1];
    if (sparse[sparse.length - 1] !== last) sparse.push(last);
    series = sparse;
  }

  const avg = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
  };

  return {
    series,
    avgEle: avg('ele'),
    avgPace: avg('pace'),
    avgHr: avg('hr'),
    avgCad: avg('cad'),
    durationSec: series[series.length - 1]?.elapsedSec ?? 0,
    distKm: series[series.length - 1]?.distKm ?? 0,
  };
};

window.destroyModalGpxCharts = function destroyModalGpxCharts() {
  if (window._modalGpxCharts?.length) {
    window._modalGpxCharts.forEach(c => { try { c.destroy(); } catch (_) {} });
  }
  window._modalGpxCharts = [];
  window._modalGpxHoverIdx = null;
  window._modalGpxSeries = null;
};

window.gpxChartsSectionHtml = function gpxChartsSectionHtml() {
  return `
    <div id="gpxChartsSection" hidden>
      <div class="marathon-route-label">Activity charts</div>
      <div class="gpx-charts-cursor muted-text" id="gpxChartsCursor">Hover charts to inspect</div>
      <p class="gpx-charts-loading muted-text" id="gpxChartsLoading" hidden>Loading GPX…</p>
      <div id="gpxChartsStack" class="gpx-charts-stack"></div>
    </div>`;
};

function gpxTickColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8b949e';
}

function gpxGridColor() {
  return 'rgba(128,128,128,0.12)';
}

window.mountGpxCharts = async function mountGpxCharts(track) {
  destroyModalGpxCharts();
  const section = document.getElementById('gpxChartsSection');
  const stack = document.getElementById('gpxChartsStack');
  const loading = document.getElementById('gpxChartsLoading');
  const cursorEl = document.getElementById('gpxChartsCursor');
  if (!section || !stack || !track?.sourceFile || typeof Chart === 'undefined') return;

  section.hidden = false;
  stack.innerHTML = '';
  if (loading) loading.hidden = false;
  document.getElementById('modalCard')?.classList.add('modal-card--charts');

  let xml;
  try {
    const res = await fetch(marathonGpxUrl(track));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    if (loading) loading.textContent = 'Could not load GPX for charts.';
    return;
  }

  const data = parseGpxSeries(xml);
  if (loading) loading.hidden = true;
  if (!data?.series?.length) {
    if (cursorEl) cursorEl.textContent = 'No chartable points in GPX.';
    return;
  }

  window._modalGpxSeries = data;
  const charts = [];
  let hoverIdx = null;

  const syncPlugin = {
    id: 'gpxCrosshairSync',
    afterEvent(chart, args) {
      const ev = args.event;
      if (!ev || !args.inChartArea) {
        if (hoverIdx != null) {
          hoverIdx = null;
          window._modalGpxHoverIdx = null;
          updateCursor(null);
          charts.forEach(c => c.draw());
        }
        return;
      }
      if (ev.type !== 'mousemove' && ev.type !== 'mouseout') return;
      if (ev.type === 'mouseout') {
        hoverIdx = null;
        window._modalGpxHoverIdx = null;
        updateCursor(null);
        charts.forEach(c => c.draw());
        return;
      }
      const els = chart.getElementsAtEventForMode(ev, 'nearest', { axis: 'x', intersect: false }, false);
      let idx = els[0]?.index;
      if (idx == null && window._modalGpxSeries?.series?.length) {
        const xScale = chart.scales.x;
        const xVal = xScale.getValueForPixel(ev.x);
        const series = window._modalGpxSeries.series;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < series.length; i++) {
          const d = Math.abs(series[i].elapsedSec - xVal);
          if (d < bestD) { bestD = d; best = i; }
        }
        idx = best;
      }
      if (idx == null || idx === hoverIdx) return;
      hoverIdx = idx;
      window._modalGpxHoverIdx = idx;
      updateCursor(idx);
      charts.forEach(c => c.draw());
    },
    afterDraw(chart) {
      const idx = hoverIdx;
      if (idx == null) return;
      const meta = chart.getDatasetMeta(0);
      const pt = meta.data[idx];
      if (!pt || pt.x == null) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(249,115,22,0.85)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.moveTo(pt.x, chartArea.top);
      ctx.lineTo(pt.x, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  function updateCursor(idx) {
    if (!cursorEl) return;
    if (idx == null) {
      cursorEl.textContent = 'Hover charts to inspect';
      return;
    }
    const p = data.series[idx];
    const parts = [fmtElapsed(p.elapsedSec)];
    if (p.ele != null) parts.push(`${Math.round(p.ele)} m`);
    if (p.pace != null) parts.push(`${fmtPaceMin(p.pace)} /km`);
    if (p.hr != null) parts.push(`${Math.round(p.hr)} bpm`);
    if (p.cad != null) parts.push(`${Math.round(p.cad)} spm`);
    cursorEl.textContent = parts.join(' · ');
  }

  function addChart({ title, color, key, avg, yFmt, reverse, min, max }) {
    const points = data.series
      .map(p => (p[key] == null ? null : { x: p.elapsedSec, y: p[key] }))
      .filter(Boolean);
    if (points.length < 2) return;
    const wrap = document.createElement('div');
    wrap.className = 'gpx-chart-panel';
    wrap.innerHTML = `
      <div class="gpx-chart-head">
        <span class="gpx-chart-title">${title}</span>
        ${avg != null ? `<span class="gpx-chart-avg">Avg: ${yFmt(avg)}</span>` : ''}
      </div>
      <div class="gpx-chart-canvas-wrap"><canvas></canvas></div>`;
    stack.appendChild(wrap);
    const ctx = wrap.querySelector('canvas').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [{
          data: data.series.map(p => ({ x: p.elapsedSec, y: p[key] })),
          borderColor: color,
          backgroundColor: color + '55',
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 3,
          borderWidth: 1.5,
          tension: 0.15,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        parsing: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            callbacks: {
              title: items => fmtElapsed(items[0]?.parsed?.x),
              label: item => `${title}: ${yFmt(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            grid: { color: gpxGridColor() },
            ticks: {
              color: gpxTickColor(),
              maxTicksLimit: 8,
              callback: v => fmtElapsed(v),
            },
          },
          y: {
            reverse: !!reverse,
            min,
            max,
            grid: { color: gpxGridColor() },
            ticks: {
              color: gpxTickColor(),
              maxTicksLimit: 5,
              callback: v => yFmt(v),
            },
          },
        },
      },
      plugins: [syncPlugin],
    });
    charts.push(chart);
  }

  addChart({
    title: 'Elevation',
    color: '#22c55e',
    key: 'ele',
    avg: data.avgEle,
    yFmt: v => (v == null ? '—' : `${Math.round(v)} m`),
  });
  addChart({
    title: 'Pace',
    color: '#38bdf8',
    key: 'pace',
    avg: data.avgPace,
    yFmt: v => (v == null ? '—' : `${fmtPaceMin(v)} /km`),
    reverse: true,
    min: 3,
    max: 10,
  });
  addChart({
    title: 'Heart rate',
    color: '#ef4444',
    key: 'hr',
    avg: data.avgHr,
    yFmt: v => (v == null ? '—' : `${Math.round(v)} bpm`),
  });
  addChart({
    title: 'Run cadence',
    color: '#a78bfa',
    key: 'cad',
    avg: data.avgCad,
    yFmt: v => (v == null ? '—' : `${Math.round(v)} spm`),
  });

  window._modalGpxCharts = charts;
  if (!charts.length && cursorEl) cursorEl.textContent = 'No chart series found in GPX.';
};
