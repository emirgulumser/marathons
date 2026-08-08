/** Garmin Connect–style activity detail page (activity.html). */
(function () {
  const params = new URLSearchParams(location.search);
  let map;
  let marker;
  let charts = [];
  let series = [];
  let hoverIdx = null;

  function status(msg, isError) {
    const el = document.getElementById('gcStatus');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.classList.toggle('gc-status--error', !!isError);
  }

  function fmtDuration(sec) {
    if (sec == null || !Number.isFinite(sec)) return '—';
    const s = Math.max(0, Math.round(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  function fmtPace(minPerKm) {
    if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm <= 0) return '—';
    const total = Math.round(minPerKm * 60);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function elevFromPoints(points) {
    let gain = 0;
    let loss = 0;
    let min = null;
    let max = null;
    for (let i = 0; i < points.length; i++) {
      const ele = points[i][2];
      if (!Number.isFinite(ele)) continue;
      if (min == null || ele < min) min = ele;
      if (max == null || ele > max) max = ele;
      if (i > 0 && Number.isFinite(points[i - 1][2])) {
        const d = ele - points[i - 1][2];
        if (d > 0.5) gain += d;
        else if (d < -0.5) loss += -d;
      }
    }
    return {
      elevGainM: Math.round(gain),
      elevLossM: Math.round(loss),
      minElev: min != null ? Math.round(min) : null,
      maxElev: max != null ? Math.round(max) : null,
    };
  }

  function seriesFromTrack(track, durationSec) {
    const pts = track.points || [];
    if (pts.length < 2) return null;
    let distKm = 0;
    const built = [{
      elapsedSec: 0, distKm: 0, ele: pts[0][2], pace: null, hr: null, cad: null,
      gct: null, vo: null, power: null, temp: null, lat: pts[0][0], lng: pts[0][1],
    }];
    for (let i = 1; i < pts.length; i++) {
      distKm += haversineKm(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      built.push({
        elapsedSec: null,
        distKm: Math.round(distKm * 1000) / 1000,
        ele: Number.isFinite(pts[i][2]) ? pts[i][2] : null,
        pace: null, hr: null, cad: null, gct: null, vo: null, power: null, temp: null,
        lat: pts[i][0], lng: pts[i][1],
      });
    }
    const totalDist = built[built.length - 1].distKm || track.trackKm || track.distKm || 0;
    const dur = durationSec > 0 ? durationSec : null;
    const avgPace = dur && totalDist > 0 ? (dur / 60) / totalDist : null;
    for (const p of built) {
      p.elapsedSec = dur && totalDist > 0 ? (p.distKm / totalDist) * dur : p.distKm * 60;
      p.pace = avgPace;
    }
    const elev = elevFromPoints(pts);
    const eles = built.map(p => p.ele).filter(v => v != null);
    return {
      series: built,
      source: 'track',
      avgEle: eles.length ? eles.reduce((s, v) => s + v, 0) / eles.length : null,
      avgPace,
      avgHr: null,
      maxHr: null,
      avgCad: null,
      avgGct: null,
      avgVo: null,
      avgPower: null,
      ...elev,
      durationSec: dur,
      distKm: totalDist,
    };
  }

  function resolveDuration(track, race, activity, detail) {
    if (activity?.durationSec > 0) return activity.durationSec;
    if (detail?.summary?.durationSec > 0) return detail.summary.durationSec;
    if (race?.time) return parseTime(race.time) * 60;
    return null;
  }

  function findTrack(tracks, activityId, raceName, raceYear) {
    const list = Object.values(tracks || {});
    if (activityId) {
      const byId = list.find(t => String(t.activityId) === String(activityId));
      if (byId) return byId;
    }
    if (raceName && raceYear) {
      const key = typeof marathonRaceKeyFromParts === 'function'
        ? marathonRaceKeyFromParts(raceName, Number(raceYear))
        : `marathon:${raceName}:${raceYear}`;
      if (tracks[key]) return tracks[key];
      return list.find(t => t.raceName === raceName && Number(t.raceYear) === Number(raceYear)) || null;
    }
    return null;
  }

  function findActivity(activities, track, activityId) {
    const id = activityId || track?.activityId;
    if (!id) return null;
    return (activities || []).find(a => String(a.id) === String(id)) || null;
  }

  function findRace(races, track) {
    if (!track?.raceName || !track?.raceYear) return null;
    return (races || []).find(r => r.name === track.raceName && r.year === track.raceYear) || null;
  }

  async function loadActivityDetails(activityId) {
    if (!activityId) return null;
    try {
      const res = await fetch(dataUrl(`data/activity-details/${activityId}.json`));
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function renderMap(track) {
    const el = document.getElementById('gcMap');
    if (!el || !track?.points?.length || typeof L === 'undefined') return;
    if (map) { map.remove(); map = null; }
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const tileUrl = isLight
      ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    map = L.map(el, { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer(tileUrl, { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);
    const latlngs = track.points.map(p => [p[0], p[1]]);
    L.polyline(latlngs, { color: '#f97316', weight: 4, opacity: 0.95 }).addTo(map);
    L.circleMarker(latlngs[0], { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 2 }).addTo(map);
    L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }).addTo(map);
    marker = L.circleMarker(latlngs[0], {
      radius: 7, color: '#fff', fillColor: '#38bdf8', fillOpacity: 1, weight: 2,
    }).addTo(map);
    map.fitBounds(L.latLngBounds(latlngs), { padding: [28, 28] });
    requestAnimationFrame(() => map.invalidateSize());
  }

  function setHover(idx) {
    hoverIdx = idx;
    const cursor = document.getElementById('gcChartsCursor');
    const scrub = document.getElementById('gcMapScrub');
    if (idx == null || !series[idx]) {
      if (cursor) cursor.textContent = 'Hover charts to inspect';
      if (scrub) scrub.hidden = true;
      charts.forEach(c => c.draw());
      return;
    }
    const p = series[idx];
    const parts = [`${p.distKm.toFixed(2)} km`];
    if (p.elapsedSec != null) parts.push(fmtDuration(p.elapsedSec));
    if (p.ele != null) parts.push(`${Math.round(p.ele)} m`);
    if (p.pace != null) parts.push(`${fmtPace(p.pace)} /km`);
    if (p.hr != null) parts.push(`${Math.round(p.hr)} bpm`);
    if (p.cad != null) parts.push(`${Math.round(p.cad)} spm`);
    if (p.gct != null) parts.push(`${Math.round(p.gct)} ms GCT`);
    if (p.power != null) parts.push(`${Math.round(p.power)} W`);
    if (cursor) cursor.textContent = parts.join(' · ');
    if (marker && p.lat != null) marker.setLatLng([p.lat, p.lng]);
    if (scrub) {
      scrub.hidden = false;
      scrub.textContent = parts.join(' · ');
    }
    charts.forEach(c => c.draw());
  }

  function tickColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#8b949e';
  }

  function renderCharts(data) {
    charts.forEach(c => c.destroy());
    charts = [];
    series = data.series || [];
    const stack = document.getElementById('gcChartsStack');
    const note = document.getElementById('gcChartsNote');
    if (!stack) return;
    stack.innerHTML = '';

    const hasSensor = series.some(p => p.hr != null || p.gct != null || (p.pace != null && data.source === 'gpx'));
    if (note) {
      note.hidden = false;
      if (data.source === 'details' || data.source === 'fit' || data.source === 'gpx') {
        note.textContent = hasSensor
          ? 'Charts from Garmin FIT sensors (pace, HR, cadence, ground contact, power).'
          : 'Charts from GPS elevation/time. Running dynamics were not in this export.';
      } else {
        note.textContent = 'Elevation from GPS track. Add a Garmin FIT export (ZIP) to data/fits/marathons/ or data/{id}.zip, then run: node scripts/import-marathon-fit.mjs';
      }
    }

    const syncPlugin = {
      id: 'gcCrosshair',
      afterEvent(chart, args) {
        const ev = args.event;
        if (!ev || !args.inChartArea || ev.type === 'mouseout') {
          if (hoverIdx != null) setHover(null);
          return;
        }
        if (ev.type !== 'mousemove') return;
        const xScale = chart.scales.x;
        const xVal = xScale.getValueForPixel(ev.x);
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i < series.length; i++) {
          const d = Math.abs(series[i].distKm - xVal);
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best !== hoverIdx) setHover(best);
      },
      afterDraw(chart) {
        if (hoverIdx == null) return;
        const meta = chart.getDatasetMeta(0);
        const pt = meta.data[hoverIdx];
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

    function addChart({ title, color, key, avg, yFmt, reverse, min, max }) {
      const points = series.filter(p => p[key] != null);
      if (points.length < 2) return;
      const wrap = document.createElement('div');
      wrap.className = 'gc-chart-panel';
      wrap.innerHTML = `
        <div class="gc-chart-head">
          <div class="gc-chart-title">${title}</div>
          ${avg != null ? `<div class="gc-chart-avg">Avg ${yFmt(avg)}</div>` : ''}
        </div>
        <div class="gc-chart-canvas-wrap"><canvas></canvas></div>`;
      stack.appendChild(wrap);
      const chart = new Chart(wrap.querySelector('canvas').getContext('2d'), {
        type: 'line',
        data: {
          datasets: [{
            data: series.map(p => ({ x: p.distKm, y: p[key] })),
            borderColor: color,
            backgroundColor: color + '44',
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 3,
            borderWidth: 1.6,
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
              callbacks: {
                title: items => `${Number(items[0]?.parsed?.x || 0).toFixed(2)} km`,
                label: item => `${title}: ${yFmt(item.parsed.y)}`,
              },
            },
          },
          scales: {
            x: {
              type: 'linear',
              title: { display: true, text: 'Distance (km)', color: tickColor() },
              grid: { color: 'rgba(128,128,128,0.12)' },
              ticks: { color: tickColor(), maxTicksLimit: 8 },
            },
            y: {
              reverse: !!reverse,
              min,
              max,
              grid: { color: 'rgba(128,128,128,0.12)' },
              ticks: { color: tickColor(), maxTicksLimit: 5, callback: v => yFmt(v) },
            },
          },
        },
        plugins: [syncPlugin],
      });
      charts.push(chart);
    }

    addChart({
      title: 'Elevation', color: '#22c55e', key: 'ele', avg: data.avgEle,
      yFmt: v => (v == null ? '—' : `${Math.round(v)} m`),
    });
    addChart({
      title: 'Pace', color: '#38bdf8', key: 'pace', avg: data.avgPace,
      yFmt: v => (v == null ? '—' : `${fmtPace(v)} /km`),
      reverse: true,
      min: data.avgPace ? Math.max(2.5, data.avgPace - 2) : 3,
      max: data.avgPace ? data.avgPace + 2.5 : 10,
    });
    addChart({
      title: 'Heart rate', color: '#ef4444', key: 'hr', avg: data.avgHr,
      yFmt: v => (v == null ? '—' : `${Math.round(v)} bpm`),
    });
    addChart({
      title: 'Cadence', color: '#a78bfa', key: 'cad', avg: data.avgCad,
      yFmt: v => (v == null ? '—' : `${Math.round(v)} spm`),
    });
    addChart({
      title: 'Ground contact', color: '#f59e0b', key: 'gct', avg: data.avgGct,
      yFmt: v => (v == null ? '—' : `${Math.round(v)} ms`),
    });
    addChart({
      title: 'Vertical oscillation', color: '#14b8a6', key: 'vo', avg: data.avgVo,
      yFmt: v => (v == null ? '—' : `${Number(v).toFixed(1)} cm`),
    });
    addChart({
      title: 'Power', color: '#fb7185', key: 'power', avg: data.avgPower,
      yFmt: v => (v == null ? '—' : `${Math.round(v)} W`),
    });

    if (!charts.length && note) note.textContent = 'No chartable series found.';
  }

  function analyzeSplit(data) {
    const s = data?.series || [];
    if (s.length < 4) return null;
    const totalDist = s[s.length - 1].distKm;
    const totalSec = s[s.length - 1].elapsedSec;
    if (!(totalDist > 1) || !(totalSec > 0)) return null;

    const mid = totalDist / 2;
    let midPt = s[0];
    let best = Infinity;
    for (const p of s) {
      const d = Math.abs(p.distKm - mid);
      if (d < best) { best = d; midPt = p; }
    }
    const firstSec = midPt.elapsedSec;
    const secondSec = totalSec - firstSec;
    if (!(firstSec > 0) || !(secondSec > 0)) return null;

    const firstDist = midPt.distKm;
    const secondDist = totalDist - firstDist;
    const firstPace = (firstSec / 60) / firstDist;
    const secondPace = (secondSec / 60) / secondDist;
    const diffSec = secondSec - firstSec;
    const diffPct = (diffSec / firstSec) * 100;

    let kind;
    let kindLabel;
    if (diffPct <= -0.5) {
      kind = 'negative';
      kindLabel = 'Negative split';
    } else if (diffPct >= 0.5) {
      kind = 'positive';
      kindLabel = 'Positive split';
    } else {
      kind = 'even';
      kindLabel = 'Even split';
    }

    // 0–100 pacing score: reward even / mild negative; punish fade.
    let score;
    if (diffPct <= 0) {
      // Even → mild negative: peak around −2% to −4%
      const ideal = -2.5;
      const distFromIdeal = Math.abs(diffPct - ideal);
      score = Math.max(70, Math.round(100 - distFromIdeal * 4));
      if (diffPct > -0.5) score = Math.max(score, 90); // nearly even still excellent
    } else {
      score = Math.max(0, Math.round(88 - diffPct * 4.5));
    }

    let verdict;
    if (kind === 'negative') verdict = 'Second half faster — strong race execution.';
    else if (kind === 'even') verdict = 'Halves nearly equal — very controlled pacing.';
    else if (diffPct < 3) verdict = 'Slight fade in the second half.';
    else if (diffPct < 7) verdict = 'Clear positive split — faded after halfway.';
    else verdict = 'Large positive split — heavy second-half slowdown.';

    return {
      kind,
      kindLabel,
      score,
      verdict,
      firstSec,
      secondSec,
      firstPace,
      secondPace,
      firstDist,
      secondDist,
      diffSec,
      diffPct: Math.round(diffPct * 10) / 10,
      midKm: Math.round(mid * 100) / 100,
    };
  }

  function renderSplitAnalysis(data) {
    const card = document.getElementById('gcSplitCard');
    if (!card) return;
    const analysis = analyzeSplit(data);
    if (!analysis) { card.hidden = true; return; }
    card.hidden = false;

    const badge = document.getElementById('gcSplitBadge');
    const scoreEl = document.getElementById('gcSplitScore');
    const halves = document.getElementById('gcSplitHalves');
    const note = document.getElementById('gcSplitNote');

    badge.textContent = analysis.kindLabel;
    badge.className = `gc-split-badge gc-split-badge--${analysis.kind}`;
    scoreEl.textContent = String(analysis.score);
    scoreEl.style.color = analysis.score >= 85 ? '#22c55e'
      : analysis.score >= 70 ? '#86efac'
        : analysis.score >= 50 ? '#fbbf24'
          : '#ef4444';

    const sign = analysis.diffSec > 0 ? '+' : '';
    halves.innerHTML = `
      <div class="gc-split-half">
        <div class="gc-sec-label">1st half (~${analysis.firstDist.toFixed(1)} km)</div>
        <div class="gc-sec-val">${fmtDuration(analysis.firstSec)}</div>
        <div class="muted-text" style="font-size:0.78rem;margin-top:4px">${fmtPace(analysis.firstPace)} /km</div>
      </div>
      <div class="gc-split-half">
        <div class="gc-sec-label">2nd half (~${analysis.secondDist.toFixed(1)} km)</div>
        <div class="gc-sec-val">${fmtDuration(analysis.secondSec)}</div>
        <div class="muted-text" style="font-size:0.78rem;margin-top:4px">${fmtPace(analysis.secondPace)} /km</div>
      </div>
      <div class="gc-split-half">
        <div class="gc-sec-label">Half difference</div>
        <div class="gc-sec-val">${sign}${fmtDuration(Math.abs(analysis.diffSec))}</div>
        <div class="muted-text" style="font-size:0.78rem;margin-top:4px">${sign}${analysis.diffPct}%</div>
      </div>`;
    note.textContent = analysis.verdict;
  }

  function buildSplits(data) {
    const s = data.series || [];
    if (s.length < 2) return [];
    const splits = [];
    let km = 1;
    let prev = s[0];
    for (const p of s) {
      while (p.distKm >= km) {
        const dKm = Math.max(0.001, p.distKm - prev.distKm);
        const dSec = (p.elapsedSec ?? 0) - (prev.elapsedSec ?? 0);
        const pace = dSec > 0 ? (dSec / 60) / dKm : null;
        const elevDelta = (p.ele != null && prev.ele != null) ? Math.round(p.ele - prev.ele) : null;
        const windowPts = s.filter(x => x.distKm >= km - 1 && x.distKm <= km && x.hr != null);
        const avgHr = windowPts.length
          ? Math.round(windowPts.reduce((a, x) => a + x.hr, 0) / windowPts.length)
          : null;
        splits.push({
          km,
          splitSec: dSec,
          pace,
          elevDelta,
          avgHr,
        });
        prev = p;
        km += 1;
        if (km > 60) break;
      }
    }
    return splits;
  }

  function renderSplits(data) {
    const block = document.getElementById('gcSplitsBlock');
    const body = document.getElementById('gcSplitsBody');
    if (!block || !body) return;
    const splits = buildSplits(data);
    if (!splits.length) { block.hidden = true; return; }
    block.hidden = false;
    body.innerHTML = splits.map(sp => `
      <tr>
        <td>${sp.km}</td>
        <td>${fmtDuration(sp.splitSec)}</td>
        <td>${fmtPace(sp.pace)}</td>
        <td>${sp.elevDelta == null ? '—' : (sp.elevDelta > 0 ? `+${sp.elevDelta}` : sp.elevDelta)} m</td>
        <td>${sp.avgHr != null ? sp.avgHr : '—'}</td>
      </tr>`).join('');
  }

  function renderStats(track, race, activity, durationSec, data) {
    const dist = activity?.distKm || data?.distKm || track.distKm || track.trackKm;
    const pace = activity?.paceMinKm || data?.avgPace
      || (durationSec && dist ? (durationSec / 60) / dist : null);
    const elevGain = activity?.elevGainM ?? data?.elevGainM ?? track.elevGainM
      ?? elevFromPoints(track.points || []).elevGainM;
    const elevLoss = activity?.elevLossM ?? data?.elevLossM ?? track.elevLossM
      ?? elevFromPoints(track.points || []).elevLossM;
    const calories = activity?.calories ?? null;

    document.getElementById('gcHeroStats').innerHTML = `
      <div class="gc-hero-stat"><div class="gc-hero-val">${dist != null ? Number(dist).toFixed(2) : '—'}</div><div class="gc-hero-label">Distance</div></div>
      <div class="gc-hero-stat"><div class="gc-hero-val">${fmtDuration(durationSec)}</div><div class="gc-hero-label">Time</div></div>
      <div class="gc-hero-stat"><div class="gc-hero-val">${fmtPace(pace)}</div><div class="gc-hero-label">Avg Pace</div></div>
      <div class="gc-hero-stat"><div class="gc-hero-val">${calories != null ? calories.toLocaleString() : '—'}</div><div class="gc-hero-label">Calories</div></div>`;

    const avgHr = activity?.avgHr ?? data?.avgHr;
    const maxHr = activity?.maxHr ?? data?.maxHr;
    const cad = activity?.avgCadence ?? data?.avgCad;
    const gct = activity?.avgGct ?? data?.avgGct;
    const vo = activity?.avgVerticalOsc ?? data?.avgVo;
    const power = activity?.avgPower ?? data?.avgPower;
    const stride = activity?.avgStrideLength;
    const minElev = activity?.minElev ?? data?.minElev ?? track.minElev;
    const maxElev = activity?.maxElev ?? data?.maxElev ?? track.maxElev;

    const secs = [
      ['Total ascent', elevGain != null ? `${elevGain} m` : null],
      ['Total descent', elevLoss != null ? `${elevLoss} m` : null],
      ['Avg HR', avgHr != null ? `${Math.round(avgHr)} bpm` : null],
      ['Max HR', maxHr != null ? `${Math.round(maxHr)} bpm` : null],
      ['Avg cadence', cad != null ? `${Math.round(cad)} spm` : null],
      ['Ground contact', gct != null ? `${Math.round(gct)} ms` : null],
      ['Vertical osc.', vo != null ? `${Number(vo).toFixed(1)} cm` : null],
      ['Avg power', power != null ? `${Math.round(power)} W` : null],
      ['Stride length', stride != null ? `${Math.round(stride)} cm` : null],
      ['Min / max elev', (minElev != null || maxElev != null) ? `${minElev ?? '—'} / ${maxElev ?? '—'} m` : null],
      ['Training effect', activity?.trainingEffect || null],
      ['VO₂ max', activity?.vo2Max != null ? activity.vo2Max : null],
      ['Temp', (activity?.tempMin != null || activity?.tempMax != null) ? `${activity.tempMin ?? '?'}–${activity.tempMax ?? '?'}°C` : null],
      ['Official time', race?.time || null],
    ].filter(([, v]) => v != null);

    document.getElementById('gcSecStats').innerHTML = secs.map(([l, v]) => `
      <div class="gc-sec-stat">
        <div class="gc-sec-label">${l}</div>
        <div class="gc-sec-val">${v}</div>
      </div>`).join('');
  }

  function renderActions(track, race, activity) {
    const parts = [];
    const garminId = activity?.id || track.activityId;
    if (garminId) {
      parts.push(`<a class="export-btn" href="https://connect.garmin.com/modern/activity/${garminId}" target="_blank" rel="noopener">Open in Garmin Connect</a>`);
    }
    parts.push('<a class="export-btn" href="index.html">Race log</a>');
    const srcUrl = typeof marathonSourceUrl === 'function' ? marathonSourceUrl(track) : null;
    if (srcUrl) {
      const label = track.sourceFormat === 'fit' || /\.(zip|fit)$/i.test(track.sourceFile || '') ? 'Download FIT' : 'Download file';
      parts.push(`<a class="export-btn" href="${srcUrl}" download="${track.sourceFile || 'activity.zip'}">${label}</a>`);
    }
    document.getElementById('gcActions').innerHTML = parts.join('');
  }

  async function loadChartData(track, durationSec, detail) {
    if (detail?.series?.length) {
      return {
        series: detail.series,
        source: 'details',
        avgEle: detail.summary?.avgEle ?? null,
        avgPace: detail.summary?.avgPace ?? null,
        avgHr: detail.summary?.avgHr ?? null,
        maxHr: detail.summary?.maxHr ?? null,
        avgCad: detail.summary?.avgCad ?? detail.summary?.avgCadence ?? null,
        avgGct: detail.summary?.avgGct ?? null,
        avgVo: detail.summary?.avgVo ?? detail.summary?.avgVerticalOsc ?? null,
        avgPower: detail.summary?.avgPower ?? null,
        elevGainM: detail.summary?.elevGainM ?? null,
        elevLossM: detail.summary?.elevLossM ?? null,
        minElev: detail.summary?.minElev ?? null,
        maxElev: detail.summary?.maxElev ?? null,
        distKm: detail.summary?.distKm ?? null,
        durationSec: detail.summary?.durationSec ?? null,
      };
    }

    // Prefer prebuilt FIT-derived details; optional live GPX parse is legacy only.
    const gpxUrl = track.sourceFormat !== 'fit' && typeof marathonGpxUrl === 'function'
      ? marathonGpxUrl(track) : null;
    if (gpxUrl && typeof parseGpxSeries === 'function') {
      try {
        const res = await fetch(gpxUrl);
        if (res.ok) {
          const parsed = parseGpxSeries(await res.text());
          if (parsed?.series?.length) {
            parsed.source = 'gpx';
            return parsed;
          }
        }
      } catch (_) { /* fall through */ }
    }
    return seriesFromTrack(track, durationSec);
  }

  async function main() {
    initTheme?.();
    const activityId = params.get('id');
    const raceName = params.get('race');
    const raceYear = params.get('year');

    if (!activityId && !(raceName && raceYear)) {
      status('Missing activity id or race/year. Example: activity.html?id=23816379030', true);
      return;
    }

    try {
      await loadAppData();
      App.countryMap = {};
      App.countryData.forEach(c => { App.countryMap[c.code] = c; });
      await loadActivities?.();
      const tracks = await loadMarathonTracks();
      const track = findTrack(tracks, activityId, raceName, raceYear);
      if (!track?.points?.length) {
        status('No GPS track found for this activity.', true);
        return;
      }

      const activity = findActivity(App.activities, track, activityId);
      const race = findRace(App.races, track);
      const detail = await loadActivityDetails(track.activityId || activityId);
      const durationSec = resolveDuration(track, race, activity, detail);

      document.getElementById('gcPage').hidden = false;
      status('');
      document.title = `${track.raceName || activity?.name || 'Activity'} — Marathon Log`;

      const flagEl = document.getElementById('gcFlag');
      if (flagEl && race?.country) flagEl.innerHTML = flagImgHtml(race.country, 40);
      document.getElementById('gcTitle').textContent = track.raceName || activity?.name || 'Activity';
      document.getElementById('gcSub').textContent = [
        track.date || activity?.date,
        race ? `${race.year} · Marathon` : (activity ? 'Activity' : null),
        activity?.location || null,
      ].filter(Boolean).join(' · ');

      const data = await loadChartData(track, durationSec, detail);
      renderStats(track, race, activity, durationSec, data);
      renderActions(track, race, activity);
      renderMap(track);
      if (data) {
        renderCharts(data);
        renderSplitAnalysis(data);
        renderSplits(data);
      }
    } catch (err) {
      console.error(err);
      status(`Failed to load activity: ${err.message}`, true);
    }
  }

  document.addEventListener('DOMContentLoaded', main);
})();
