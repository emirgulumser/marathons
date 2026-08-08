/** Parse marathon GPX and render Garmin-style synced charts in the activity modal. */

window.activityHasGpx = function activityHasGpx(a) {
  return !!trackForActivity?.(a);
};

window.gpxIconHtml = function gpxIconHtml(a) {
  if (!activityHasGpx(a)) return '<span class="gpx-cell gpx-cell--empty" aria-hidden="true"></span>';
  return `<span class="gpx-cell" title="FIT/GPS route available" aria-label="Route available">
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
    const num = (patterns) => {
      for (const p of patterns) {
        const mm = block.match(p);
        if (mm && mm[1] !== '') {
          const v = parseFloat(mm[1]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };
    const ele = num([/<ele>([^<]*)<\/ele>/i]);
    const timeM = block.match(/<time>([^<]*)<\/time>/i);
    const t = timeM ? Date.parse(timeM[1]) : NaN;
    raw.push({
      lat,
      lng,
      ele,
      t: Number.isFinite(t) ? t : null,
      hr: num([
        /<(?:[\w.]+:)?hr>([^<]*)<\/(?:[\w.]+:)?hr>/i,
        /<(?:[\w.]+:)?heartrate>([^<]*)<\/(?:[\w.]+:)?heartrate>/i,
      ]),
      cad: num([
        /<(?:[\w.]+:)?cad>([^<]*)<\/(?:[\w.]+:)?cad>/i,
        /<(?:[\w.]+:)?cadence>([^<]*)<\/(?:[\w.]+:)?cadence>/i,
      ]),
      gct: num([
        /<(?:[\w.]+:)?groundcontacttime>([^<]*)<\/(?:[\w.]+:)?groundcontacttime>/i,
        /<(?:[\w.]+:)?gct>([^<]*)<\/(?:[\w.]+:)?gct>/i,
      ]),
      vo: num([
        /<(?:[\w.]+:)?verticaloscillation>([^<]*)<\/(?:[\w.]+:)?verticaloscillation>/i,
      ]),
      power: num([
        /<(?:[\w.]+:)?power>([^<]*)<\/(?:[\w.]+:)?power>/i,
        /<(?:[\w.]+:)?pwr>([^<]*)<\/(?:[\w.]+:)?pwr>/i,
      ]),
      temp: num([
        /<(?:[\w.]+:)?atemp>([^<]*)<\/(?:[\w.]+:)?atemp>/i,
        /<(?:[\w.]+:)?temp>([^<]*)<\/(?:[\w.]+:)?temp>/i,
      ]),
    });
  }
  if (raw.length < 2) return null;

  const t0 = raw.find(p => p.t != null)?.t ?? 0;
  let distKm = 0;
  let elevGain = 0;
  let elevLoss = 0;
  const built = [];
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i];
    if (i > 0) {
      distKm += gpxHaversineKm(raw[i - 1].lat, raw[i - 1].lng, p.lat, p.lng);
      if (p.ele != null && raw[i - 1].ele != null) {
        const dEle = p.ele - raw[i - 1].ele;
        if (dEle > 0.5) elevGain += dEle;
        else if (dEle < -0.5) elevLoss += -dEle;
      }
    }
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
      gct: Number.isFinite(p.gct) ? p.gct : null,
      vo: Number.isFinite(p.vo) ? p.vo : null,
      power: Number.isFinite(p.power) ? p.power : null,
      temp: Number.isFinite(p.temp) ? p.temp : null,
      lat: p.lat,
      lng: p.lng,
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
  const max = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return Math.round(Math.max(...vals) * 10) / 10;
  };
  const min = (key) => {
    const vals = series.map(p => p[key]).filter(v => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return Math.round(Math.min(...vals) * 10) / 10;
  };

  return {
    series,
    avgEle: avg('ele'),
    minEle: min('ele'),
    maxEle: max('ele'),
    elevGainM: Math.round(elevGain),
    elevLossM: Math.round(elevLoss),
    avgPace: avg('pace'),
    avgHr: avg('hr'),
    maxHr: max('hr'),
    avgCad: avg('cad'),
    avgGct: avg('gct'),
    avgVo: avg('vo'),
    avgPower: avg('power'),
    avgTemp: avg('temp'),
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
      <p class="gpx-charts-loading muted-text" id="gpxChartsLoading" hidden>Loading sensors…</p>
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
  if (!section || !stack || !track || typeof Chart === 'undefined') return;

  section.hidden = false;
  stack.innerHTML = '';
  if (loading) {
    loading.hidden = false;
    loading.textContent = 'Loading sensors…';
  }
  document.getElementById('modalCard')?.classList.add('modal-card--charts');

  let data = null;
  try {
    if (track.activityId) {
      const det = await fetch(dataUrl(`data/activity-details/${track.activityId}.json`));
      if (det.ok) {
        const payload = await det.json();
        if (payload?.series?.length) {
          data = {
            series: payload.series,
            avgEle: payload.summary?.avgEle ?? null,
            avgPace: payload.summary?.avgPace ?? null,
            avgHr: payload.summary?.avgHr ?? null,
            avgCad: payload.summary?.avgCad ?? payload.summary?.avgCadence ?? null,
            avgGct: payload.summary?.avgGct ?? null,
            avgVo: payload.summary?.avgVo ?? payload.summary?.avgVerticalOsc ?? null,
            avgPower: payload.summary?.avgPower ?? null,
          };
        }
      }
    }
    if (!data && track.sourceFile && track.sourceFormat !== 'fit') {
      const res = await fetch(marathonSourceUrl(track));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = parseGpxSeries(await res.text());
    }
  } catch (err) {
    if (loading) loading.textContent = 'Could not load activity charts.';
    return;
  }

  if (loading) loading.hidden = true;
  if (!data?.series?.length) {
    if (cursorEl) cursorEl.textContent = 'No chartable sensor series. Import a FIT zip: node scripts/import-marathon-fit.mjs';
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
    if (p.gct != null) parts.push(`${Math.round(p.gct)} ms GCT`);
    if (p.power != null) parts.push(`${Math.round(p.power)} W`);
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
  addChart({
    title: 'Ground contact',
    color: '#f59e0b',
    key: 'gct',
    avg: data.avgGct,
    yFmt: v => (v == null ? '—' : `${Math.round(v)} ms`),
  });
  addChart({
    title: 'Vertical oscillation',
    color: '#14b8a6',
    key: 'vo',
    avg: data.avgVo,
    yFmt: v => (v == null ? '—' : `${Number(v).toFixed(1)} cm`),
  });
  addChart({
    title: 'Power',
    color: '#fb7185',
    key: 'power',
    avg: data.avgPower,
    yFmt: v => (v == null ? '—' : `${Math.round(v)} W`),
  });

  window._modalGpxCharts = charts;
  if (!charts.length && cursorEl) cursorEl.textContent = 'No chart series found.';
};
