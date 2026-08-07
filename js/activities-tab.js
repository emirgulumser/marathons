/** Garmin activities tab — full analytics hub. */
window.initActivitiesTab = async function () {
  if (window._activitiesTabInit) return;
  const loading = document.getElementById('actLoading');
  const main = document.getElementById('actMain');
  loading.hidden = false;
  try {
    await loadActivities();
  } catch (e) {
    loading.textContent = 'Failed to load activities.';
    return;
  }
  loading.hidden = true;
  main.hidden = false;
  window._activitiesTabInit = true;

  const U = ActivitiesUtils;
  const activities = App.activities;
  const summary = App.activitySummary || {};
  const actById = new Map(activities.map(a => [a.id, a]));

  window.actFilterState = { date: null, year: 'all', minDist: null };
  window.actHeatmapState = { year: 'all', minDist: null };
  window.actMapState = { year: 'all', minDist: null };
  window.actPage = 0;
  window.actSortCol = 'date';
  window.actSortDir = -1;
  window.actCompareIds = [];
  window.actMonthChartYear = new Date().getFullYear();
  window.actWeekChartYear = new Date().getFullYear();
  window.actWeekStatsYear = 'all';
  window.actWeekThreshold = null;
  window.actMarathonBlockKey = null;
  window.actMarathonBlockWeeks = 12;
  window.actMaraBlockSortCol = 'raceDate';
  window.actMaraBlockSortDir = -1;
  window.actPredictBacktestPage = 0;
  window.actPredictBacktestPageSize = 10;
  window.actPredictBacktestSortCol = 'raceDate';
  window.actPredictBacktestSortDir = -1;
  window.actPredictCompareKey = null;

  const ACT_STORAGE_KEY = 'marathons-act-state';

  function loadActState() {
    try {
      const s = JSON.parse(sessionStorage.getItem(ACT_STORAGE_KEY) || '{}');
      if (s.filterState) {
        const saved = { ...s.filterState };
        if (saved.chip === 'unlogged') window._actRestoreTypeFilter = 'unlogged';
        delete saved.chip;
        Object.assign(window.actFilterState, saved);
      }
      if (s.heatmapState) Object.assign(window.actHeatmapState, s.heatmapState);
      if (s.mapState) Object.assign(window.actMapState, s.mapState);
      if (s.monthChartYear != null) window.actMonthChartYear = s.monthChartYear;
      if (s.weekChartYear != null) window.actWeekChartYear = s.weekChartYear;
      if (s.weekStatsYear != null) window.actWeekStatsYear = s.weekStatsYear;
      if (s.weekThreshold !== undefined) window.actWeekThreshold = s.weekThreshold;
      if (s.marathonBlockKey) window.actMarathonBlockKey = s.marathonBlockKey;
      if (s.marathonBlockWeeks != null) window.actMarathonBlockWeeks = s.marathonBlockWeeks;
      if (s.predictDate) window.actPredictDate = s.predictDate;
      if (s.predictBacktestPage != null) window.actPredictBacktestPage = s.predictBacktestPage;
      if (s.predictBacktestPageSize != null) window.actPredictBacktestPageSize = s.predictBacktestPageSize;
      if (s.predictBacktestSortCol) window.actPredictBacktestSortCol = s.predictBacktestSortCol;
      if (s.predictBacktestSortDir != null) window.actPredictBacktestSortDir = s.predictBacktestSortDir;
    } catch (_) { /* ignore */ }
  }

  function saveActState() {
    try {
      sessionStorage.setItem(ACT_STORAGE_KEY, JSON.stringify({
        filterState: window.actFilterState,
        heatmapState: window.actHeatmapState,
        mapState: window.actMapState,
        monthChartYear: window.actMonthChartYear,
        weekChartYear: window.actWeekChartYear,
        weekStatsYear: window.actWeekStatsYear,
        weekThreshold: window.actWeekThreshold,
        marathonBlockKey: window.actMarathonBlockKey,
        marathonBlockWeeks: window.actMarathonBlockWeeks,
        predictDate: window.actPredictDate,
        predictBacktestPage: window.actPredictBacktestPage,
        predictBacktestPageSize: window.actPredictBacktestPageSize,
        predictBacktestSortCol: window.actPredictBacktestSortCol,
        predictBacktestSortDir: window.actPredictBacktestSortDir,
      }));
    } catch (_) { /* ignore */ }
  }

  loadActState();

  const charts = {};

  function getFiltered() {
    return U.filterActivities(activities, U.getFilters());
  }

  function hasActiveFilters() {
    const f = U.getFilters();
    return f.search || f.type !== 'all' || f.year !== 'all' || f.date || f.minDist != null;
  }

  function renderFilterButtons(containerId, items, activeValue, onSelect) {
    const bar = document.getElementById(containerId);
    if (!bar) return;
    bar.innerHTML = '';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-btn' + (activeValue === item.id ? ' active' : '');
      btn.textContent = item.label;
      btn.onclick = () => { onSelect(item.id); saveActState(); };
      bar.appendChild(btn);
    });
  }

  function populateYearSelect(selectId, years, value, includeAll, onChange) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const items = includeAll
      ? [{ id: 'all', label: 'All years' }, ...years.map(y => ({ id: String(y), label: String(y) }))]
      : years.map(y => ({ id: y, label: String(y) }));
    sel.innerHTML = items.map(i => `<option value="${i.id}">${i.label}</option>`).join('');
    sel.value = String(value);
    sel.onchange = () => { onChange(sel.value); saveActState(); };
  }

  function getHeatmapActivities() {
    const hs = window.actHeatmapState;
    let list = activities.filter(U.isRun);
    if (hs.minDist != null) list = list.filter(a => a.distKm > hs.minDist);
    return list;
  }

  function findActivity(id) {
    return actById.get(id);
  }

  function renderPrCards() {
    const prs = summary.prs || {};
    const labels = {
      '5k': '5K', '10k': '10K', half: 'Half Marathon', marathon: 'Marathon',
      longestRun: 'Longest Run', mostElev: 'Most Elevation',
    };
    const grid = document.getElementById('actPrGrid');
    grid.innerHTML = '';
    Object.entries(labels).forEach(([key, label]) => {
      const pr = prs[key];
      const el = document.createElement('div');
      el.className = 'pr-card';
      if (pr) {
        const act = findActivity(pr.id);
        const flag = key === 'marathon' && act ? U.raceFlagHtml(act, App.races, 28) : '';
        el.innerHTML = `
          ${flag ? `<div class="pr-flag">${flag}</div>` : ''}
          <div class="pr-label">${label}</div>
          <div class="pr-value">${key === 'mostElev' ? `+${pr.elevGainM} m` : key === 'longestRun' ? `${pr.distKm} km` : U.fmtPace(pr.paceMinKm)}</div>
          <div class="pr-sub">${pr.date}${pr.name ? ' · ' + pr.name : ''}</div>`;
        el.onclick = () => openActModal(findActivity(pr.id));
        el.style.cursor = 'pointer';
      } else {
        el.innerHTML = `<div class="pr-label">${label}</div><div class="pr-value">—</div>`;
      }
      grid.appendChild(el);
    });
  }

  const racePredictions = summary.racePredictions || null;
  const RP = window.RacePrediction;
  let predictFlatpickr = null;

  function getPredictDate() {
    return window.actPredictDate || racePredictions?.defaultDate || new Date().toISOString().slice(0, 10);
  }

  function sanitizePredictDate(date, rp) {
    const fallback = rp?.defaultDate;
    if (!fallback) return null;
    const min = rp.minDate || fallback;
    const max = rp.defaultDate || fallback;
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fallback;
    if (date < min) return min;
    if (date > max) return max;
    return date;
  }

  function setPredictDate(date, opts = {}) {
    const safe = sanitizePredictDate(date, racePredictions);
    if (!safe) return;
    if ('raceKey' in opts) window.actPredictCompareKey = opts.raceKey || null;
    window.actPredictDate = safe;
    const input = document.getElementById('actPredictDate');
    if (predictFlatpickr) predictFlatpickr.setDate(safe, false);
    else if (input) input.value = safe;
    saveActState();
    renderRacePredictions(safe);
  }

  function confidenceBadge(level) {
    const labels = { high: 'High confidence', medium: 'Medium', low: 'Low', none: 'No data' };
    return `<span class="predict-confidence predict-confidence--${level || 'none'}">${labels[level] || labels.none}</span>`;
  }

  function renderPredictCards(pred, date) {
    const grid = document.getElementById('actPredictCards');
    if (!grid) return;
    grid.innerHTML = '';
    const items = [
      { key: 'marathon', label: 'Marathon' },
      { key: 'half', label: 'Half marathon' },
    ];
    items.forEach(({ key, label }) => {
      const row = pred[key];
      const el = document.createElement('div');
      el.className = 'pr-card predict-card';
      if (row?.minutes != null) {
        const spread = row.spreadMin != null ? `±${row.spreadMin} min` : '';
        el.innerHTML = `
          <div class="pr-label">${label}</div>
          <div class="pr-value">${fmtTime(row.minutes)}</div>
          <div class="pr-sub">${U.fmtPace(row.paceMinKm)} · ${date}</div>
          <div class="predict-card-meta">${confidenceBadge(row.confidence)} ${spread ? `<span class="muted-text">${spread}</span>` : ''}</div>`;
      } else {
        el.innerHTML = `<div class="pr-label">${label}</div><div class="pr-value">—</div><div class="pr-sub">Not enough recent data</div>`;
      }
      grid.appendChild(el);
    });
  }

  function renderPredictCompare(pred, date) {
    const panel = document.getElementById('actPredictCompare');
    if (!panel || !RP) return;
    const blocks = summary.marathonBlocks || [];
    const race = RP.findCompareRace(date, blocks, window.actPredictCompareKey, 21);
    if (!race || pred.marathon?.minutes == null) {
      panel.hidden = true;
      return;
    }
    const daysUntil = RP.daysBetween(date, race.raceDate);
    const err = Math.round((race.raceMinutes - pred.marathon.minutes) * 10) / 10;
    const act = race.raceActivityId ? findActivity(race.raceActivityId) : null;
    panel.hidden = false;
    panel.innerHTML = `
      <div class="section-title" style="font-size:0.95rem;margin-bottom:8px">Actual vs predicted</div>
      <p class="muted-text" style="margin:0 0 12px">${race.raceName} ${race.raceYear} is ${daysUntil} day${daysUntil === 1 ? '' : 's'} after ${date}.</p>
      <div class="predict-compare-grid">
        <div><span class="predict-compare-label">Predicted</span><strong>${fmtTime(pred.marathon.minutes)}</strong></div>
        <div><span class="predict-compare-label">Actual</span><strong>${fmtTime(race.raceMinutes)}</strong></div>
        <div><span class="predict-compare-label">Error</span><strong class="${Math.abs(err) <= 5 ? 'predict-err-good' : ''}" title="Negative = faster than predicted">${err > 0 ? '+' : ''}${err} min</strong></div>
      </div>
      ${act ? `<button type="button" class="filter-btn" id="actPredictRaceActBtn" style="margin-top:12px">View race activity</button>` : ''}`;
    document.getElementById('actPredictRaceActBtn')?.addEventListener('click', () => openActModal(act));
  }

  function renderPredictMethods(pred) {
    const tbody = document.querySelector('#actPredictMethods tbody');
    if (!tbody) return;
    const m = pred.marathon?.models || {};
    const rows = [
      {
        name: 'Best effort (Riegel)',
        minutes: m.riegel?.minutes,
        source: m.riegel?.source
          ? `${m.riegel.source.tag.toUpperCase()} · ${m.riegel.source.date} · ${U.fmtPace(m.riegel.source.paceMinKm)}`
          : '—',
        actId: m.riegel?.source?.id,
      },
      {
        name: 'Threshold pace',
        minutes: m.threshold?.minutes,
        source: m.threshold ? `${m.threshold.hardRunCount} hard runs · ${U.fmtPace(m.threshold.paceMinKm)}` : '—',
      },
      {
        name: 'VO₂ max (Daniels)',
        minutes: m.vo2?.minutes,
        source: m.vo2
          ? `Garmin ${m.vo2.vo2Max} → VDOT ${m.vo2.effectiveVdot} · ${m.vo2.date}`
          : '—',
        actId: m.vo2?.activityId,
      },
      {
        name: 'Block similarity',
        minutes: m.blockSim?.minutes,
        source: m.blockSim?.neighbors?.length
          ? m.blockSim.neighbors.map(n => n.label).join(', ')
          : '—',
      },
    ];
    tbody.innerHTML = rows.map(r => `
      <tr class="${r.actId ? 'predict-method-row' : ''}" ${r.actId ? `data-act-id="${r.actId}"` : ''}>
        <td>${r.name}</td>
        <td>${r.minutes != null ? fmtTime(r.minutes) : '—'}</td>
        <td>${r.source}</td>
      </tr>`).join('');
    tbody.querySelectorAll('.predict-method-row').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        const act = findActivity(Number(tr.dataset.actId));
        if (act) openActModal(act);
      });
    });
  }

  function closestTimelineIndex(labels, date) {
    if (!labels.length) return -1;
    const t = new Date(date + 'T12:00:00').getTime();
    let best = 0;
    let bestDiff = Infinity;
    labels.forEach((d, i) => {
      const diff = Math.abs(new Date(d + 'T12:00:00').getTime() - t);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }

  function renderPredictTimeline(selectedDate) {
    const canvas = document.getElementById('actPredictTimelineChart');
    if (!canvas || !racePredictions) return;
    const timeline = racePredictions.timeline || [];
    const labels = timeline.map(p => p.date);
    const values = timeline.map(p => p.marathonMinutes);
    const actuals = (summary.marathonBlocks || [])
      .filter(b => b.raceMinutes != null)
      .map(b => ({
        x: closestTimelineIndex(labels, b.raceDate),
        y: b.raceMinutes,
        label: `${b.raceName} ${b.raceYear}`,
      }))
      .filter(p => p.x >= 0);
    const selectedIdx = closestTimelineIndex(labels, selectedDate);
    const annotations = selectedIdx >= 0 ? {
      selectedDate: {
        type: 'line',
        xMin: selectedIdx,
        xMax: selectedIdx,
        borderColor: '#f97316',
        borderWidth: 2,
        borderDash: [4, 4],
        label: { display: true, content: selectedDate, position: 'start', color: '#f97316', font: { size: 10 } },
      },
    } : {};

    if (!charts.predictTimeline) {
      charts.predictTimeline = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Predicted marathon',
              data: values,
              borderColor: '#3b82f6',
              backgroundColor: 'rgba(59,130,246,0.1)',
              fill: true,
              tension: 0.2,
              pointRadius: 0,
              pointHitRadius: 8,
            },
            {
              type: 'scatter',
              label: 'Actual marathon',
              data: actuals,
              backgroundColor: '#22c55ebb',
              borderColor: '#22c55e',
              pointRadius: 5,
              pointHoverRadius: 8,
              parsing: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#8b949e' } },
            tooltip: {
              backgroundColor: '#1f2937',
              callbacks: {
                label: ctx => {
                  if (ctx.dataset.label === 'Actual marathon') {
                    return ` ${ctx.raw.label}: ${fmtTime(ctx.raw.y)}`;
                  }
                  return ` Predicted: ${fmtTime(ctx.raw)}`;
                },
              },
            },
            annotation: { annotations },
          },
          scales: {
            x: {
              ticks: { color: '#8b949e', maxTicksLimit: 12 },
              grid: { display: false },
            },
            y: {
              ticks: { color: '#8b949e', callback: v => fmtTime(v) },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Finish time', color: '#8b949e' },
            },
          },
        },
      });
    } else {
      charts.predictTimeline.data.labels = labels;
      charts.predictTimeline.data.datasets[0].data = values;
      charts.predictTimeline.data.datasets[1].data = actuals;
      charts.predictTimeline.options.plugins.annotation.annotations = annotations;
      charts.predictTimeline.update();
    }
  }

  function sortPredictBacktestRows(rows) {
    const col = window.actPredictBacktestSortCol || 'raceDate';
    const dir = window.actPredictBacktestSortDir ?? -1;
    const getters = {
      raceDate: r => r.raceDate,
      predictDate: r => r.predictDate,
      predicted: r => r.predictedMinutes,
      actual: r => r.actualMinutes,
      error: r => r.errorMin,
    };
    const get = getters[col] || getters.raceDate;
    return [...rows].sort((a, b) => {
      let av = get(a);
      let bv = get(b);
      if (av == null) av = dir > 0 ? Infinity : -Infinity;
      if (bv == null) bv = dir > 0 ? Infinity : -Infinity;
      if (typeof av === 'string') {
        av = av.toLowerCase();
        bv = String(bv).toLowerCase();
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }

  function renderPredictBacktest() {
    const statsEl = document.getElementById('actPredictBacktestStats');
    const tbody = document.querySelector('#actPredictBacktestTable tbody');
    const pageInfo = document.getElementById('actPredictBacktestPageInfo');
    const prevBtn = document.getElementById('actPredictBacktestPrev');
    const nextBtn = document.getElementById('actPredictBacktestNext');
    if (!tbody || !racePredictions) return;
    const backtest = sortPredictBacktestRows(racePredictions.backtest || []);
    const col = window.actPredictBacktestSortCol;
    const dir = window.actPredictBacktestSortDir;
    const stats = RP?.backtestStats(backtest) || {};
    if (statsEl) {
      statsEl.textContent = stats.count
        ? `MAE ${stats.mae} min · within ±5 min: ${stats.within5}% · within ±10 min: ${stats.within10}% (${stats.count} races)`
        : 'No backtest data — re-run import.';
    }

    const pageSize = parseInt(
      document.getElementById('actPredictBacktestPageSize')?.value ||
      String(window.actPredictBacktestPageSize || 10),
      10
    );
    const totalPages = Math.max(1, Math.ceil(backtest.length / pageSize));
    if (window.actPredictBacktestPage >= totalPages) {
      window.actPredictBacktestPage = Math.max(0, totalPages - 1);
    }
    const page = window.actPredictBacktestPage;
    const start = page * pageSize;
    const slice = backtest.slice(start, start + pageSize);

    tbody.innerHTML = slice.map(row => {
      const err = row.errorMin;
      const errCls = err == null ? '' : Math.abs(err) <= 5 ? 'predict-err-good' : Math.abs(err) > 15 ? 'warn-row' : '';
      const errTxt = err == null ? '—' : `${err > 0 ? '+' : ''}${err} min`;
      return `<tr class="predict-backtest-row" data-predict-date="${row.predictDate}" data-race-key="${row.key}" style="cursor:pointer">
        <td>${row.raceName} ${row.raceYear}</td>
        <td>${row.predictDate}</td>
        <td>${row.predictedMinutes != null ? fmtTime(row.predictedMinutes) : '—'}</td>
        <td>${fmtTime(row.actualMinutes)}</td>
        <td class="${errCls}">${errTxt}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.predict-backtest-row').forEach(tr => {
      tr.addEventListener('click', () => {
        document.querySelectorAll('.predict-quick-btn.active').forEach(b => b.classList.remove('active'));
        setPredictDate(tr.dataset.predictDate, { raceKey: tr.dataset.raceKey });
        document.getElementById('actPredictCards')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    if (pageInfo) {
      pageInfo.textContent = backtest.length
        ? `${start + 1}–${Math.min(start + pageSize, backtest.length)} of ${backtest.length}`
        : 'No races';
    }
    if (prevBtn) prevBtn.disabled = page <= 0;
    if (nextBtn) nextBtn.disabled = page >= totalPages - 1;

    document.querySelectorAll('#actPredictBacktestTable th[data-col]').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.col === col) {
        th.classList.add(dir > 0 ? 'sorted-asc' : 'sorted-desc');
      }
    });
  }

  function renderPredictQuickPicks() {
    const bar = document.getElementById('actPredictQuickBtns');
    if (!bar || !racePredictions) return;
    bar.innerHTML = '';
    const picks = (racePredictions.backtest || []).slice(0, 6);
    picks.forEach(row => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'predict-quick-btn';
      btn.textContent = `T−7 · ${row.raceName} ${row.raceYear}`;
      btn.title = row.predictDate;
      btn.onclick = () => {
        document.querySelectorAll('.predict-quick-btn.active').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        setPredictDate(row.predictDate, { raceKey: row.key });
      };
      bar.appendChild(btn);
    });
  }

  function installPredictYearSelect(fp, minYear, maxYear) {
    const monthNav = fp.calendarContainer?.querySelector('.flatpickr-current-month');
    if (!monthNav) return;
    let sel = monthNav.querySelector('.flatpickr-year-select');
    if (!sel) {
      const wrapper = monthNav.querySelector('.numInputWrapper');
      if (!wrapper) return;
      sel = document.createElement('select');
      sel.className = 'flatpickr-year-select';
      sel.setAttribute('aria-label', 'Year');
      for (let y = maxYear; y >= minYear; y--) {
        const opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => {
        fp.changeYear(Number(sel.value));
      });
      wrapper.replaceWith(sel);
    }
    const y = String(fp.currentYear);
    if (sel.value !== y) sel.value = y;
  }

  function initRacePredictions() {
    const input = document.getElementById('actPredictDate');
    if (!input || !RP) return;
    const rp = racePredictions;
    if (!rp) {
      document.getElementById('actSectionPredictions')?.insertAdjacentHTML('beforeend',
        '<p class="muted-text">Race predictions unavailable — run <code>node scripts/import-garmin.mjs</code>.</p>');
      return;
    }
    input.min = rp.minDate;
    input.max = rp.defaultDate;
    const initial = sanitizePredictDate(window.actPredictDate, rp) || rp.defaultDate;
    window.actPredictDate = initial;

    if (typeof flatpickr !== 'undefined') {
      const wrap = document.getElementById('actPredictDateWrap');
      const minYear = Number(rp.minDate.slice(0, 4));
      const maxYear = Number(rp.defaultDate.slice(0, 4));
      predictFlatpickr = flatpickr(wrap, {
        wrap: true,
        dateFormat: 'Y-m-d',
        altInput: true,
        altFormat: 'j M Y',
        defaultDate: initial,
        minDate: rp.minDate,
        maxDate: rp.defaultDate,
        disableMobile: true,
        monthSelectorType: 'static',
        onReady(_dates, _dateStr, instance) {
          installPredictYearSelect(instance, minYear, maxYear);
        },
        onOpen(_dates, _dateStr, instance) {
          installPredictYearSelect(instance, minYear, maxYear);
        },
        onMonthChange(_dates, _dateStr, instance) {
          installPredictYearSelect(instance, minYear, maxYear);
        },
        onYearChange(_dates, _dateStr, instance) {
          installPredictYearSelect(instance, minYear, maxYear);
        },
        onChange(_dates, dateStr) {
          window.actPredictDate = dateStr;
          saveActState();
        },
      });
    } else {
      input.value = initial;
    }

    document.getElementById('actPredictCalcBtn')?.addEventListener('click', () => {
      const date = predictFlatpickr
        ? predictFlatpickr.input.value
        : input.value;
      document.querySelectorAll('.predict-quick-btn.active').forEach(b => b.classList.remove('active'));
      setPredictDate(date, { raceKey: null });
    });

    const btPageSize = document.getElementById('actPredictBacktestPageSize');
    if (btPageSize) {
      btPageSize.value = String(window.actPredictBacktestPageSize || 10);
      btPageSize.addEventListener('change', () => {
        window.actPredictBacktestPageSize = parseInt(btPageSize.value, 10);
        window.actPredictBacktestPage = 0;
        saveActState();
        renderPredictBacktest();
      });
    }
    document.getElementById('actPredictBacktestPrev')?.addEventListener('click', () => {
      if (window.actPredictBacktestPage > 0) {
        window.actPredictBacktestPage--;
        saveActState();
        renderPredictBacktest();
      }
    });
    document.getElementById('actPredictBacktestNext')?.addEventListener('click', () => {
      window.actPredictBacktestPage++;
      saveActState();
      renderPredictBacktest();
    });

    document.querySelectorAll('#actPredictBacktestTable th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const c = th.dataset.col;
        window.actPredictBacktestSortDir = window.actPredictBacktestSortCol === c
          ? window.actPredictBacktestSortDir * -1
          : (c === 'raceDate' || c === 'predictDate' ? -1 : 1);
        window.actPredictBacktestSortCol = c;
        window.actPredictBacktestPage = 0;
        saveActState();
        renderPredictBacktest();
      });
    });

    renderPredictQuickPicks();
    renderRacePredictions(initial);
  }

  function renderRacePredictions(date) {
    if (!RP || !racePredictions) return;
    const safe = sanitizePredictDate(date, racePredictions) || racePredictions.defaultDate;
    const pred = RP.predictAsOf(activities, summary.marathonBlocks || [], App.races, safe);
    renderPredictCards(pred, safe);
    renderPredictCompare(pred, safe);
    renderPredictMethods(pred);
    renderPredictTimeline(safe);
    renderPredictBacktest();
  }

  function renderStats(list) {
    const agg = U.aggregateFiltered(list);
    document.getElementById('actStats').innerHTML = `
      <div class="stat-card c-blue"><div class="stat-icon">🏃</div><div class="stat-value">${agg.total.toLocaleString()}</div><div class="stat-label">Activities</div></div>
      <div class="stat-card c-orange"><div class="stat-icon">📍</div><div class="stat-value">${agg.runs.toLocaleString()}</div><div class="stat-label">Runs</div></div>
      <div class="stat-card c-teal"><div class="stat-icon">📏</div><div class="stat-value">${agg.totalKm.toLocaleString()}</div><div class="stat-label">Run km</div></div>
      <div class="stat-card c-purple"><div class="stat-icon">⏱️</div><div class="stat-value">${agg.totalHours.toLocaleString()}h</div><div class="stat-label">Moving Time</div></div>
      <div class="stat-card c-gold"><div class="stat-icon">⚡</div><div class="stat-value">${U.fmtPace(agg.avgPace)}</div><div class="stat-label">Avg Pace</div></div>
      <div class="stat-card c-green"><div class="stat-icon">⛰️</div><div class="stat-value">${agg.totalElev.toLocaleString()}m</div><div class="stat-label">Elevation</div></div>
      <div class="stat-card c-pink"><div class="stat-icon">❤️</div><div class="stat-value">${agg.avgHr || '—'}</div><div class="stat-label">Avg HR</div></div>`;
  }

  function getWeekVolumeList() {
    return activities.filter(a => U.isRun(a));
  }

  function getVolumeChartList() {
    return getWeekVolumeList();
  }

  function updateCharts(list) {
    const yearData = U.kmByYear(getVolumeChartList());
    const yearBg = yearData.values.map(v => U.yearBarColors(v).bg);
    const yearBorder = yearData.values.map(v => U.yearBarColors(v).border);
    if (!charts.year) {
      charts.year = new Chart(document.getElementById('actYearChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: yearData.years,
          datasets: [{
            label: 'km',
            data: yearData.values,
            backgroundColor: yearBg,
            borderColor: yearBorder,
            borderWidth: 1.5,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1f2937',
              borderColor: '#374151',
              borderWidth: 1,
              padding: 12,
              callbacks: { label: i => ` ${i.raw.toLocaleString()} km` },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#8b949e' } },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Kilometres', color: '#8b949e' },
            },
          },
        },
      });
    } else {
      charts.year.data.labels = yearData.years;
      charts.year.data.datasets[0].data = yearData.values;
      charts.year.data.datasets[0].backgroundColor = yearBg;
      charts.year.data.datasets[0].borderColor = yearBorder;
      charts.year.update();
    }

    const monthYear = window.actMonthChartYear;
    const monthData = U.kmByMonth(getVolumeChartList(), monthYear);
    const monthBg = monthData.values.map(v => U.monthBarColors(v).bg);
    const monthBorder = monthData.values.map(v => U.monthBarColors(v).border);
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!charts.month) {
      charts.month = new Chart(document.getElementById('actMonthChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            data: monthData.values,
            backgroundColor: monthBg,
            borderColor: monthBorder,
            borderWidth: 1,
            borderRadius: 6,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1f2937',
              callbacks: { label: i => ` ${i.raw} km` },
            },
          },
          scales: {
            x: { ticks: { color: '#8b949e' }, grid: { display: false } },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Kilometres', color: '#8b949e' },
            },
          },
        },
      });
    } else {
      charts.month.data.datasets[0].data = monthData.values;
      charts.month.data.datasets[0].backgroundColor = monthBg;
      charts.month.data.datasets[0].borderColor = monthBorder;
      charts.month.update();
    }

    const weekYear = window.actWeekChartYear;
    const weekList = getVolumeChartList();
    const weekData = U.kmByWeek(weekList, weekYear);
    const weekBg = weekData.values.map(v => U.weekBarColors(v).bg);
    const weekBorder = weekData.values.map(v => U.weekBarColors(v).border);
    const weekTooltipTitle = items => {
      const i = items[0]?.dataIndex;
      const r = weekData.ranges?.[i];
      const label = weekData.labels[i];
      return r ? `${label} · ${r.start} → ${r.end}` : label;
    };
    if (!charts.week) {
      charts.week = new Chart(document.getElementById('actWeekChart').getContext('2d'), {
        type: 'bar',
        data: {
          labels: weekData.labels,
          datasets: [{
            data: weekData.values,
            backgroundColor: weekBg,
            borderColor: weekBorder,
            borderWidth: 1,
            borderRadius: 3,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1f2937',
              callbacks: {
                title: weekTooltipTitle,
                label: i => ` ${i.raw} km`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#8b949e', maxTicksLimit: 26, font: { size: 10 } },
              grid: { display: false },
              title: { display: true, text: 'ISO week (Mon–Sun)', color: '#8b949e', font: { size: 11 } },
            },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Kilometres', color: '#8b949e' },
            },
          },
        },
      });
    } else {
      charts.week.data.labels = weekData.labels;
      charts.week.data.datasets[0].data = weekData.values;
      charts.week.data.datasets[0].backgroundColor = weekBg;
      charts.week.data.datasets[0].borderColor = weekBorder;
      charts.week.options.plugins.tooltip.callbacks.title = weekTooltipTitle;
      charts.week.update();
    }

    renderWeekStats(weekList);
  }

  function renderHeatmapBlock(dayMap, weeks, metric, opts = {}) {
    const { label, merged } = opts;
    const { level } = U.heatmapLevels(dayMap, metric);

    const block = document.createElement('div');
    block.className = 'heatmap-year-block';

    if (label) {
      const labelEl = document.createElement('div');
      labelEl.className = 'heatmap-year-label';
      labelEl.textContent = label;
      block.appendChild(labelEl);
    }

    const wrap = document.createElement('div');
    wrap.className = 'heatmap-wrap';

    const monthsEl = document.createElement('div');
    monthsEl.className = 'heatmap-month-labels';
    monthsEl.style.width = `${weeks.length * 16}px`;
    let lastKey = '';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    weeks.forEach((week, wi) => {
      const d = week.find(x => x);
      if (!d) return;
      const dt = new Date(d + 'T12:00:00');
      const key = merged ? `${dt.getFullYear()}-${dt.getMonth()}` : String(dt.getMonth());
      if (key !== lastKey) {
        lastKey = key;
        const span = document.createElement('span');
        span.textContent = merged && dt.getMonth() === 0 ? String(dt.getFullYear()) : monthNames[dt.getMonth()];
        span.style.left = `${wi * 16}px`;
        monthsEl.appendChild(span);
      }
    });
    wrap.appendChild(monthsEl);

    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';
    weeks.forEach(week => {
      week.forEach(date => {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell heatmap-cell--empty';
        if (date) {
          const d = dayMap.get(date);
          const v = d ? (d[metric] || 0) : 0;
          const lv = level(v);
          cell.className = `heatmap-cell heatmap-cell--level-${lv}`;
          cell.title = `${date}: ${d ? d.km.toFixed(1) + ' km, ' + d.runs + ' run(s)' : 'rest'}`;
          cell.onmouseenter = e => {
            const tip = document.getElementById('actHeatmapTooltip');
            tip.hidden = false;
            tip.textContent = cell.title;
            tip.style.left = e.pageX + 8 + 'px';
            tip.style.top = e.pageY + 8 + 'px';
          };
          cell.onmouseleave = () => { document.getElementById('actHeatmapTooltip').hidden = true; };
          cell.onclick = () => {
            window.actFilterState.date = date;
            window.actFilterState.year = date.slice(0, 4);
            renderTableFilters();
            document.getElementById('actClearDate').hidden = false;
            window.actPage = 0;
            refreshActivitiesView();
            document.getElementById('actSectionTable')?.scrollIntoView({ behavior: 'smooth' });
          };
        }
        grid.appendChild(cell);
      });
    });
    wrap.appendChild(grid);
    block.appendChild(wrap);
    return block;
  }

  function renderHeatmap() {
    const hs = window.actHeatmapState;
    const metric = document.getElementById('actHeatmapMetric')?.value || 'km';
    const actList = getHeatmapActivities();
    const container = document.getElementById('actHeatmapContainer');
    container.innerHTML = '';

    if (hs.year === 'all') {
      const dayMap = U.buildDayMapAll(actList, true);
      const weeks = U.heatmapWeeksRange(actList.map(a => a.date));
      if (weeks.length) {
        const dates = actList.map(a => a.date).sort();
        const minY = dates[0]?.slice(0, 4) || '';
        const maxY = dates[dates.length - 1]?.slice(0, 4) || '';
        container.appendChild(renderHeatmapBlock(dayMap, weeks, metric, {
          label: minY && maxY ? `${minY} – ${maxY}` : 'All years',
          merged: true,
        }));
      }
    } else {
      const year = Number(hs.year);
      const dayMap = U.buildDayMapForIsoYear(actList, year, true);
      const weeks = U.heatmapWeeks(year);
      container.appendChild(renderHeatmapBlock(dayMap, weeks, metric, { label: `${year} (ISO weeks)` }));
    }

    document.getElementById('actHeatmapLegend').innerHTML = `
      <span>Less</span>
      ${[0, 1, 2, 3, 4].map(i => `<span class="heatmap-cell heatmap-cell--level-${i}"></span>`).join('')}
      <span>More</span>`;
  }

  function renderHeatmapFilters() {
    const years = [...new Set(activities.map(a => a.year))].sort((a, b) => b - a);
    const hs = window.actHeatmapState;
    populateYearSelect('actHeatmapYearSelect', years, hs.year, true, id => {
      hs.year = id;
      renderHeatmap();
    });
    renderFilterButtons('actHeatmapDistBtns', U.DIST_FILTERS, hs.minDist,
      id => { hs.minDist = id; renderHeatmapFilters(); renderHeatmap(); }
    );
  }

  function getWeekStatsList(list) {
    const y = window.actWeekStatsYear;
    return y === 'all' ? list : list.filter(a => a.year === y);
  }

  function renderYearLegend() {
    const el = document.getElementById('actYearLegend');
    if (!el) return;
    el.innerHTML = U.YEAR_VOLUME_BANDS.map(b => `
      <span class="volume-legend-item">
        <span class="volume-legend-swatch" style="background:${b.color}bb;border-color:${b.color}"></span>
        ${b.label}
      </span>`).join('');
  }

  function renderMonthLegend() {
    const el = document.getElementById('actMonthLegend');
    if (!el) return;
    el.innerHTML = U.MONTH_VOLUME_BANDS.map(b => `
      <span class="volume-legend-item">
        <span class="volume-legend-swatch" style="background:${b.color}bb;border-color:${b.color}"></span>
        ${b.label}
      </span>`).join('');
  }

  function renderWeekLegend() {
    const el = document.getElementById('actWeekLegend');
    if (!el) return;
    el.innerHTML = U.WEEK_VOLUME_BANDS.map(b => `
      <span class="volume-legend-item">
        <span class="volume-legend-swatch" style="background:${b.color}bb;border-color:${b.color}"></span>
        ${b.label}
      </span>`).join('');
  }

  function renderWeekStats(list) {
    const statsList = getWeekStatsList(list);
    const statsYear = window.actWeekStatsYear;
    const period = statsYear === 'all' ? 'All time' : String(statsYear);
    const colors = ['c-teal', 'c-orange', 'c-red'];
    const icons = ['📊', '🔥', '💯'];
    document.getElementById('actWeekStats').innerHTML = U.WEEK_THRESHOLDS.map((km, i) => `
      <div class="stat-card ${colors[i]}">
        <div class="stat-icon">${icons[i]}</div>
        <div class="stat-value">${U.weeksOverKm(statsList, km, statsYear === 'all' ? null : statsYear)}</div>
        <div class="stat-label">Weeks ≥ ${km} km · ${period}</div>
      </div>`).join('');
    renderWeekYearsByThreshold(list);
  }

  function renderWeekYearsByThreshold(list) {
    const row = document.getElementById('actWeekYearsByThreshold');
    if (!row) return;
    const km = window.actWeekThreshold;
    const allYears = [...new Set(list.map(a => a.year))].sort((a, b) => b - a);
    const qualifying = km == null ? allYears : U.yearsWithWeekOverKm(list, km);
    const statsYear = window.actWeekStatsYear;
    if (statsYear !== 'all' && !qualifying.includes(statsYear)) {
      window.actWeekStatsYear = 'all';
    }
    row.innerHTML = '';
    const items = [{ id: 'all', label: 'All years' }, ...qualifying.map(y => ({ id: y, label: String(y) }))];
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = statsYear === item.id || statsYear === Number(item.id);
      btn.className = 'filter-btn' + (active ? ' active' : '');
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        window.actWeekStatsYear = item.id === 'all' ? 'all' : Number(item.id);
        if (item.id !== 'all') {
          window.actWeekChartYear = Number(item.id);
          renderWeekChartYearFilters();
          document.getElementById('actWeekChart')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        renderWeekYearsByThreshold(list);
        updateCharts(getFiltered());
        saveActState();
      });
      row.appendChild(btn);
    });
  }

  function renderWeekThresholdFilters() {
    renderFilterButtons('actWeekThresholdBtns',
      U.WEEK_THRESHOLDS.map(km => ({ id: km, label: `≥ ${km} km` })),
      window.actWeekThreshold,
      id => {
        window.actWeekThreshold = Number(id);
        renderWeekThresholdFilters();
        renderWeekStats(getWeekVolumeList());
        saveActState();
      }
    );
  }

  function resetWeekVolumeFilters() {
    window.actWeekStatsYear = 'all';
    window.actWeekThreshold = null;
    const years = [...new Set(getWeekVolumeList().map(a => a.year))].sort((a, b) => b - a);
    if (years.length) window.actWeekChartYear = years[0];
    renderWeekThresholdFilters();
    renderWeekChartYearFilters();
    renderWeekStats(getWeekVolumeList());
    updateCharts(getFiltered());
    saveActState();
  }

  function renderWeekChartYearFilters() {
    const years = [...new Set(getVolumeChartList().map(a => a.year))].sort((a, b) => b - a);
    renderFilterButtons('actWeekChartYearBtns',
      years.map(y => ({ id: y, label: String(y) })),
      window.actWeekChartYear,
      id => {
        window.actWeekChartYear = Number(id);
        renderWeekChartYearFilters();
        updateCharts(getFiltered());
        document.getElementById('actWeekChart')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        saveActState();
      }
    );
  }

  const marathonBlocksCache = {};

  function getMarathonBlocks() {
    const weeks = window.actMarathonBlockWeeks || U.MARATHON_BLOCK_WEEKS;
    if (!marathonBlocksCache[weeks]) {
      const pre = summary.marathonBlocks;
      if (pre?.length && weeks === 12) {
        marathonBlocksCache[weeks] = pre.map(b => {
          const race = App.races.find(r => U.marathonKey(r) === b.key);
          return {
            ...b,
            raceMinutes: b.raceMinutes ?? race?.minutes,
            isPB: b.isPB ?? race?.isPB,
            raceCountry: b.raceCountry ?? race?.country,
          };
        });
      } else {
        marathonBlocksCache[weeks] = U.computeAllMarathonBlocks(activities, App.races || [], weeks);
      }
    }
    return marathonBlocksCache[weeks];
  }

  let marathonBlocks = [];
  marathonBlocks = getMarathonBlocks();
  if (marathonBlocks.length && !window.actMarathonBlockKey) {
    window.actMarathonBlockKey = marathonBlocks[0].key;
  }

  function refreshMarathonBlocks() {
    marathonBlocks = getMarathonBlocks();
    initMarathonBlockSelect();
    renderMarathonBlockDetail();
    renderMarathonBlockTable();
    updateMarathonBlockChart();
    updateMarathonBlockScatter();
  }

  function renderMarathonBlockWeekFilters() {
    renderFilterButtons('actMaraBlockWeekBtns',
      [12, 16, 18].map(w => ({ id: w, label: `${w} wks` })),
      window.actMarathonBlockWeeks,
      id => {
        window.actMarathonBlockWeeks = Number(id);
        marathonBlocks = getMarathonBlocks();
        if (!marathonBlocks.some(b => b.key === window.actMarathonBlockKey)) {
          window.actMarathonBlockKey = marathonBlocks[0]?.key || null;
        }
        renderMarathonBlockWeekFilters();
        refreshMarathonBlocks();
      }
    );
  }

  function getMarathonBlock() {
    return marathonBlocks.find(b => b.key === window.actMarathonBlockKey) || marathonBlocks[0] || null;
  }

  function selectMarathonBlock(key) {
    window.actMarathonBlockKey = key;
    const sel = document.getElementById('actMaraBlockSelect');
    if (sel && sel.value !== key) sel.value = key;
    saveActState();
    renderMarathonBlockDetail();
    renderMarathonBlockTable();
    updateMarathonBlockChart();
  }

  window.selectMarathonBlock = selectMarathonBlock;

  window.openMarathonTrainingBlock = function (raceName, raceYear) {
    const key = `${raceName}|${raceYear}`;
    window.actMarathonBlockKey = key;
    switchTab('activities', { marathonKey: key });
  };

  window._pendingMarathonBlockKey = null;

  function initMarathonBlockSelect() {
    const sel = document.getElementById('actMaraBlockSelect');
    if (!sel) return;
    sel.innerHTML = marathonBlocks.map(b =>
      `<option value="${b.key}">${b.raceName} ${b.raceYear}${b.major ? ' ★' : ''} · ${b.raceDate} · ${b.raceTime}</option>`
    ).join('');
    if (window.actMarathonBlockKey) sel.value = window.actMarathonBlockKey;
    sel.onchange = () => selectMarathonBlock(sel.value);
  }

  function renderMarathonBlockDetail() {
    const el = document.getElementById('actMaraBlockDetail');
    if (!el) return;
    const b = getMarathonBlock();
    if (!b) {
      el.innerHTML = '<p class="section-desc">No matched marathon activities found.</p>';
      return;
    }
    const longest = b.longest
      ? `<button type="button" class="mara-long-run-link" data-id="${b.longest.id}">${b.longest.distKm} km · ${b.longest.date}</button>`
      : '—';
    const peak = b.peakWeek ? `${b.peakWeek.km} km (${b.peakWeek.label})` : '—';
    const taper = b.taperAvgKm != null && b.peakWeek
      ? `${b.taperAvgKm} km avg (W-1/W-2) · ${b.taperVsPeakPct}% of peak`
      : '—';
    const stats = [
      ['Total volume', `${b.totalKm} km`],
      ['Runs', String(b.runCount)],
      ['Runs ≥15 km', String(b.runsOver15)],
      ['Runs >20 km', String(b.runsOver20)],
      ['Runs >25 km', String(b.runsOver25)],
      ['Runs >30 km', String(b.runsOver30)],
      ['Longest run', longest],
      ['Avg / week', `${b.avgWeeklyKm} km`],
      ['Peak week', peak],
      ['Taper', taper],
      ['Moving time', U.fmtDuration(b.durationSec)],
      ['Elevation', `${b.elevGainM.toLocaleString()} m`],
      ['Avg pace', U.fmtPace(b.avgPace)],
      ['Hard runs', String(b.hardRuns)],
      ['Weeks ≥50 km', String(b.weeksOver50)],
      ['Weeks ≥80 km', String(b.weeksOver80)],
      ['Weeks ≥100 km', String(b.weeksOver100)],
      ['Active weeks', `${b.activeWeeks}/${b.blockWeeks || window.actMarathonBlockWeeks}`],
    ];
    el.innerHTML = `
      <div class="mara-block-meta">
        <strong>${b.raceName} ${b.raceYear}</strong>${b.major ? ' · Major' : ''}
        · Race ${b.raceDate} · ${b.raceTime}
        · Block ${b.window.start} → ${b.window.end}
        · ${b.blockWeeks || window.actMarathonBlockWeeks} weeks
        <span class="mara-block-meta-actions" id="actMaraBlockMetaActions"></span>
      </div>
      <div class="mara-block-stats">
        ${stats.map(([label, val]) => `
          <div class="mara-block-stat">
            <div class="mara-block-stat-val">${val}</div>
            <div class="mara-block-stat-label">${label}</div>
          </div>`).join('')}
      </div>`;
    el.querySelectorAll('.mara-long-run-link').forEach(btn => {
      btn.addEventListener('click', () => openActModal(findActivity(Number(btn.dataset.id))));
    });
    const metaActions = document.getElementById('actMaraBlockMetaActions');
    if (metaActions && b.raceActivityId) {
      loadMarathonTracks().then(() => {
        const track = trackForMarathon(b.raceName, b.raceYear);
        if (!track) return;
        const raceAct = findActivity(b.raceActivityId);
        metaActions.innerHTML = `
          <button type="button" class="export-btn mara-block-route-btn">Race route</button>`;
        metaActions.querySelector('.mara-block-route-btn')?.addEventListener('click', () => {
          if (raceAct) openActModal(raceAct);
          else openMarathonRouteModal(b.raceName, b.raceYear);
        });
      });
    }
  }

  function sortMarathonBlocks(col) {
    if (window.actMaraBlockSortCol === col) {
      window.actMaraBlockSortDir *= -1;
    } else {
      window.actMaraBlockSortCol = col;
      window.actMaraBlockSortDir = col === 'raceName' ? 1 : -1;
    }
    renderMarathonBlockTable();
  }

  function marathonBlockRaceCell(b) {
    const code = b.raceCountry ?? App.races?.find(r => U.marathonKey(r) === b.key)?.country;
    const label = `${b.raceName}${b.major ? ' ★' : ''}`;
    if (!code) return label;
    return `<span class="cell-flag-label">${flagImgHtml(code, 18)}<span>${label}</span></span>`;
  }

  function renderMarathonBlockTable() {
    const body = document.getElementById('actMaraBlockBody');
    if (!body) return;
    window._marathonBlocksExport = marathonBlocks;
    const col = window.actMaraBlockSortCol;
    const dir = window.actMaraBlockSortDir;
    const sorted = [...marathonBlocks].sort((a, b) => {
      let av = a[col];
      let bv = b[col];
      if (col === 'longest') {
        av = a.longest?.distKm ?? 0;
        bv = b.longest?.distKm ?? 0;
      } else if (col === 'peakWeek') {
        av = a.peakWeek?.km ?? 0;
        bv = b.peakWeek?.km ?? 0;
      } else if (col === 'raceTime') {
        av = parseTime(a.raceTime);
        bv = parseTime(b.raceTime);
      }
      if (typeof av === 'string') return dir * av.localeCompare(bv);
      return dir * (av - bv);
    });

    body.innerHTML = sorted.map(b => {
      const longest = b.longest ? `${b.longest.distKm}` : '—';
      const peak = b.peakWeek ? `${b.peakWeek.km}` : '—';
      const active = b.key === window.actMarathonBlockKey ? ' mara-block-row-active' : '';
      return `<tr class="${active.trim()}" data-key="${b.key}">
        <td>${marathonBlockRaceCell(b)}</td>
        <td>${b.raceYear}</td>
        <td>${b.raceDate}</td>
        <td>${b.raceTime}</td>
        <td>${b.totalKm}</td>
        <td>${b.runCount}</td>
        <td>${b.runsOver20}</td>
        <td>${b.runsOver30}</td>
        <td>${longest}</td>
        <td>${b.avgWeeklyKm}</td>
        <td>${peak}</td>
        <td>${b.weeksOver50}</td>
        <td>${b.weeksOver80}</td>
        <td>${b.weeksOver100}</td>
        <td>${b.hardRuns}</td>
      </tr>`;
    }).join('');

    const foot = document.getElementById('actMaraBlockFoot');
    if (foot) {
      const rows = [
        U.avgBlockRow(marathonBlocks, 'Avg — all'),
        U.avgBlockRow(marathonBlocks, 'Avg — PB at time', b => b.isPB),
        U.avgBlockRow(marathonBlocks, 'Avg — sub-3', b => b.raceMinutes != null && b.raceMinutes < 180),
      ].filter(Boolean);
      foot.innerHTML = rows.map(r => `
        <tr class="mara-block-summary-row">
          <td colspan="4"><strong>${r.label}</strong> <span class="muted-text">(n=${r.count})</span></td>
          <td>${r.totalKm}</td>
          <td>${r.runCount}</td>
          <td>${r.runsOver20}</td>
          <td>${r.runsOver30}</td>
          <td>—</td>
          <td>${r.avgWeeklyKm}</td>
          <td>—</td>
          <td>${r.weeksOver50}</td>
          <td>${r.weeksOver80}</td>
          <td>${r.weeksOver100}</td>
          <td>${r.hardRuns}</td>
        </tr>`).join('');
    }

    document.querySelectorAll('#actMaraBlockTable th[data-col]').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.col === col) {
        th.classList.add(dir > 0 ? 'sorted-asc' : 'sorted-desc');
      }
    });

    body.querySelectorAll('tr[data-key]').forEach(tr => {
      tr.addEventListener('click', () => selectMarathonBlock(tr.dataset.key));
    });
  }

  function updateMarathonBlockChart() {
    const b = getMarathonBlock();
    const canvas = document.getElementById('actMaraBlockWeekChart');
    if (!canvas || !b) return;
    const labels = b.weekly.map(w => w.label);
    const values = b.weekly.map(w => w.km);
    const bg = values.map(v => U.weekBarColors(v).bg);
    const border = values.map(v => U.weekBarColors(v).border);
    if (!charts.maraBlock) {
      charts.maraBlock = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1f2937',
              callbacks: {
                title: items => {
                  const w = b.weekly[items[0].dataIndex];
                  return w ? `${w.label} · ${w.start} → ${w.end}` : items[0].label;
                },
                label: i => ` ${i.raw} km`,
              },
            },
          },
          scales: {
            x: {
              ticks: { color: '#8b949e', font: { size: 11 } },
              grid: { display: false },
              title: { display: true, text: 'Weeks before race', color: '#8b949e' },
            },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: 'rgba(255,255,255,0.05)' },
              title: { display: true, text: 'Kilometres', color: '#8b949e' },
            },
          },
        },
      });
    } else {
      charts.maraBlock.data.labels = labels;
      charts.maraBlock.data.datasets[0].data = values;
      charts.maraBlock.data.datasets[0].backgroundColor = bg;
      charts.maraBlock.data.datasets[0].borderColor = border;
      charts.maraBlock.options.plugins.tooltip.callbacks.title = items => {
        const w = b.weekly[items[0].dataIndex];
        return w ? `${w.label} · ${w.start} → ${w.end}` : items[0].label;
      };
      charts.maraBlock.update();
    }
  }

  function updateMarathonBlockScatter() {
    const canvas = document.getElementById('actMaraBlockScatterChart');
    if (!canvas) return;
    const pts = marathonBlocks.filter(b => b.raceMinutes != null);
    const data = pts.map(b => ({ x: b.totalKm, y: b.raceMinutes, label: `${b.raceName} ${b.raceYear}` }));
    if (!charts.maraScatter) {
      charts.maraScatter = new Chart(canvas.getContext('2d'), {
        type: 'scatter',
        data: {
          datasets: [{
            data,
            backgroundColor: '#f97316bb',
            borderColor: '#f97316',
            pointRadius: 5,
            pointHoverRadius: 8,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1f2937',
              callbacks: {
                label: ctx => ` ${ctx.raw.label}: ${ctx.raw.x} km · ${fmtTime(ctx.raw.y)}`,
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: 'Block volume (km)', color: '#8b949e' },
              ticks: { color: '#8b949e' },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
            y: {
              title: { display: true, text: 'Finish time', color: '#8b949e' },
              ticks: { color: '#8b949e', callback: v => fmtTime(v) },
              grid: { color: 'rgba(255,255,255,0.05)' },
            },
          },
        },
      });
    } else {
      charts.maraScatter.data.datasets[0].data = data;
      charts.maraScatter.update();
    }
  }

  function renderMonthChartYearFilters() {
    const years = [...new Set(getVolumeChartList().map(a => a.year))].sort((a, b) => b - a);
    renderFilterButtons('actMonthChartYearBtns',
      years.map(y => ({ id: y, label: String(y) })),
      window.actMonthChartYear,
      id => {
        window.actMonthChartYear = Number(id);
        renderMonthChartYearFilters();
        updateCharts(getFiltered());
        document.getElementById('actMonthChart')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        saveActState();
      }
    );
  }

  function renderTableFilters() {
    const years = [...new Set(activities.map(a => a.year))].sort((a, b) => b - a);
    const fs = window.actFilterState;
    populateYearSelect('actYearSelect', years, fs.year, true, id => {
      fs.year = id;
      window.actPage = 0;
      renderTableFilters();
      refreshActivitiesView();
    });
    renderFilterButtons('actDistBtns', U.DIST_FILTERS, fs.minDist, id => {
      fs.minDist = id;
      window.actPage = 0;
      renderTableFilters();
      refreshActivitiesView();
    });
  }

  function buildMapHeatPoints(runList) {
    const grid = new Map();
    runList.forEach(a => {
      const key = `${a.lat.toFixed(3)},${a.lng.toFixed(3)}`;
      const cell = grid.get(key) || { lat: a.lat, lng: a.lng, runs: 0, km: 0 };
      cell.runs += 1;
      cell.km += a.distKm || 0;
      grid.set(key, cell);
    });
    const maxRuns = Math.max(1, ...[...grid.values()].map(c => c.runs));
    return [...grid.values()].map(c => [c.lat, c.lng, c.runs / maxRuns]);
  }

  function initMapBase() {
    if (window.actMapRef) return;
    const actMap = L.map('actMap', { zoomControl: true, scrollWheelZoom: false }).setView([39.9, 32.8], 6);
    window.actMapRef = actMap;
    const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    const lightTile = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    window.actTileLayer = L.tileLayer(
      document.documentElement.getAttribute('data-theme') === 'light' ? lightTile : darkTile,
      { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }
    ).addTo(actMap);
  }

  function renderMapHeatmap() {
    initMapBase();
    const map = window.actMapRef;
    if (window.actHeatLayer) {
      map.removeLayer(window.actHeatLayer);
      window.actHeatLayer = null;
    }

    const ms = window.actMapState;
    let outdoor = activities.filter(a => U.isRun(a) && a.lat && a.lng);
    if (ms.year !== 'all') outdoor = outdoor.filter(a => String(a.year) === String(ms.year));
    if (ms.minDist != null) outdoor = outdoor.filter(a => a.distKm > ms.minDist);

    const info = document.getElementById('actMapInfo');
    if (info) {
      const distLabel = ms.minDist != null ? ` · >${ms.minDist} km` : '';
      info.textContent = outdoor.length
        ? `${outdoor.length.toLocaleString()} runs · ${ms.year === 'all' ? 'all years' : ms.year}${distLabel}`
        : 'No runs with GPS for this filter';
    }

    if (!outdoor.length || !L.heatLayer) return;

    const points = buildMapHeatPoints(outdoor);
    window.actHeatLayer = L.heatLayer(points, {
      radius: 20,
      blur: 16,
      maxZoom: 14,
      minOpacity: 0.35,
      gradient: {
        0.0: '#1e3a5f',
        0.35: '#3b82f6',
        0.55: '#22c55e',
        0.75: '#f97316',
        1.0: '#ef4444',
      },
    }).addTo(map);

    const bounds = L.latLngBounds(points.map(p => [p[0], p[1]]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: ms.year === 'all' ? 8 : 11 });
    }
  }

  function renderMapFilters() {
    const years = [...new Set(activities.map(a => a.year))].sort((a, b) => b - a);
    const ms = window.actMapState;
    populateYearSelect('actMapYearSelect', years, ms.year, true, id => {
      ms.year = id;
      renderMapHeatmap();
    });
    renderFilterButtons('actMapDistBtns', U.DIST_FILTERS, ms.minDist,
      id => { ms.minDist = id; renderMapFilters(); renderMapHeatmap(); }
    );
  }

  function initMap() {
    renderMapFilters();
    renderMapHeatmap();
  }

  function renderTable(list) {
    const pageSize = parseInt(document.getElementById('actPageSize')?.value || '100', 10);
    const col = window.actSortCol;
    const dir = window.actSortDir;
    list = [...list].sort((a, b) => {
      let av = a[col], bv = b[col];
      if (av == null) av = dir > 0 ? Infinity : -Infinity;
      if (bv == null) bv = dir > 0 ? Infinity : -Infinity;
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });

    const page = window.actPage;
    const start = page * pageSize;
    const slice = list.slice(start, start + pageSize);
    const tbody = document.getElementById('actTableBody');
    tbody.innerHTML = '';
    const compareMode = document.getElementById('actCompareToggle')?.checked;

    slice.forEach((a, i) => {
      const tr = document.createElement('tr');
      if (window.actFilterState.date === a.date) tr.classList.add('highlight-row');
      const checked = window.actCompareIds.includes(a.id);
      tr.innerHTML = `
        <td>${compareMode ? `<input type="checkbox" data-id="${a.id}" ${checked ? 'checked' : ''}>` : ''}</td>
        <td style="color:var(--muted)">${start + i + 1}</td>
        <td>${a.date}</td>
        <td>${U.activityNameHtml(a, App.races)}</td>
        <td>${U.typeLabel(a.type)}</td>
        <td>${a.distKm > 0 ? a.distKm.toFixed(2) : '—'}</td>
        <td>${U.fmtDuration(a.durationSec)}</td>
        <td>${U.fmtPace(a.paceMinKm)}</td>
        <td style="color:var(--muted)">${a.location || '—'}</td>`;
      tr.querySelector('td:nth-child(3)')?.addEventListener('click', e => e.stopPropagation());
      tr.onclick = e => {
        if (e.target.type === 'checkbox') return;
        openActModal(a);
      };
      const cb = tr.querySelector('input[type=checkbox]');
      if (cb) {
        cb.onclick = e => {
          e.stopPropagation();
          toggleCompare(a.id, cb.checked);
        };
      }
      tbody.appendChild(tr);
    });

    document.querySelectorAll('#actTable th[data-col]').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.col === col) th.classList.add(dir > 0 ? 'sorted-asc' : 'sorted-desc');
    });

    const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
    if (page >= totalPages) window.actPage = Math.max(0, totalPages - 1);
    document.getElementById('actPageInfo').textContent = list.length
      ? `${start + 1}–${Math.min(start + pageSize, list.length)} of ${list.length.toLocaleString()}`
      : 'No activities match filters';
    document.getElementById('actPrevBtn').disabled = page <= 0;
    document.getElementById('actNextBtn').disabled = page >= totalPages - 1;
  }

  function toggleCompare(id, on) {
    if (on) {
      if (window.actCompareIds.length >= 2) window.actCompareIds.shift();
      window.actCompareIds.push(id);
    } else {
      window.actCompareIds = window.actCompareIds.filter(x => x !== id);
    }
    renderCompareBar();
    renderTable(getFiltered());
  }

  function renderCompareBar() {
    const bar = document.getElementById('actCompareBar');
    const ids = window.actCompareIds;
    if (ids.length < 2) { bar.hidden = true; return; }
    const [a, b] = ids.map(findActivity);
    if (!a || !b) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = `
      <div class="compare-bar-inner">
        <strong>Compare</strong>
        <div class="compare-cols">
          <div><b>${a.date}</b> ${a.distKm} km · ${U.fmtPace(a.paceMinKm)} · ${U.fmtDuration(a.durationSec)}${a.avgHr ? ' · ' + a.avgHr + ' bpm' : ''}</div>
          <div><b>${b.date}</b> ${b.distKm} km · ${U.fmtPace(b.paceMinKm)} · ${U.fmtDuration(b.durationSec)}${b.avgHr ? ' · ' + b.avgHr + ' bpm' : ''}</div>
        </div>
        <button class="page-btn" onclick="window.actCompareIds=[];document.getElementById('actCompareBar').hidden=true;refreshActivitiesView()">Clear</button>
      </div>`;
  }

  window.openActModal = function (a) {
    if (!a) return;
    destroyModalRouteMap();
    const similar = U.findSimilar(a, activities);
    let raceHtml = '';
    let raceActions = '';
    if (a.raceLink) {
      const rl = a.raceLink;
      const statusLabel = rl.status === 'matched' ? 'Matched' : rl.status === 'unverified' ? 'Matched (time differs)' : rl.status;
      const times = rl.garminTime && rl.logTime
        ? ` · Garmin ${rl.garminTime} · Log ${rl.logTime}`
        : rl.logTime ? ` · Log ${rl.logTime}` : '';
      raceHtml = `<div style="margin:8px 0;color:var(--muted)">${statusLabel}${rl.raceName ? ' · ' + rl.raceName + ' ' + rl.raceYear : ''}${times}</div>`;
      if (rl.kind === 'marathon' && rl.raceName && rl.raceYear) {
        const rn = rl.raceName.replace(/'/g, "\\'");
        const matchedRace = App.races.find(r => r.name === rl.raceName && r.year === rl.raceYear);
        const raceOpen = matchedRace
          ? `<button type="button" class="export-btn" onclick="closeModal();setTimeout(()=>openModal(App.races[${matchedRace.idx - 1}]),120)">Marathon detail</button>`
          : '';
        raceActions = `
          ${raceOpen}
          <button type="button" class="export-btn" onclick="closeModal();openMarathonTrainingBlock('${rn}',${rl.raceYear})">12-week build</button>
          <button type="button" class="export-btn" id="actModalRouteBtn" hidden>Race route</button>`;
      }
    }
    const extras = [
      a.trainingEffect && ['Training effect', a.trainingEffect],
      a.vo2Max && ['VO₂ max', a.vo2Max],
      a.avgCadence && ['Cadence', a.avgCadence + ' spm'],
      a.avgPower && ['Power', a.avgPower + ' W'],
      a.deviceId && ['Device', a.deviceId],
      (a.tempMin != null || a.tempMax != null) && ['Temp', `${a.tempMin ?? '?'}–${a.tempMax ?? '?'}°C`],
    ].filter(Boolean);

    const marathonFlag = U.raceFlagHtml(a, App.races, 48);

    document.getElementById('modalContent').innerHTML = `
      ${marathonFlag ? `<div class="modal-flag">${marathonFlag}</div>` : ''}
      <div class="modal-title">${a.name}</div>
      <div class="modal-subtitle">${a.date} · ${U.typeLabel(a.type)}${a.location ? ' · ' + a.location : ''}</div>
      <div class="modal-time" style="color:#f97316">${a.distKm > 0 ? a.distKm.toFixed(2) + ' km' : U.fmtDuration(a.durationSec)}</div>
      ${raceHtml}
      <div class="modal-grid">
        <div class="modal-stat-box"><div class="modal-stat-label">Duration</div><div class="modal-stat-val">${U.fmtDuration(a.durationSec)}</div></div>
        <div class="modal-stat-box"><div class="modal-stat-label">Pace</div><div class="modal-stat-val">${U.fmtPace(a.paceMinKm)}</div></div>
        ${a.avgHr ? `<div class="modal-stat-box"><div class="modal-stat-label">Avg HR</div><div class="modal-stat-val">${a.avgHr}</div></div>` : ''}
        ${a.maxHr ? `<div class="modal-stat-box"><div class="modal-stat-label">Max HR</div><div class="modal-stat-val">${a.maxHr}</div></div>` : ''}
        ${a.elevGainM ? `<div class="modal-stat-box"><div class="modal-stat-label">Elevation</div><div class="modal-stat-val">+${a.elevGainM} m</div></div>` : ''}
        ${a.calories ? `<div class="modal-stat-box"><div class="modal-stat-label">Calories</div><div class="modal-stat-val">${a.calories}</div></div>` : ''}
        ${extras.map(([l, v]) => `<div class="modal-stat-box"><div class="modal-stat-label">${l}</div><div class="modal-stat-val">${v}</div></div>`).join('')}
      </div>
      ${marathonRouteSectionHtml()}
      ${similar.length ? `<div class="similar-runs"><div class="section-title" style="font-size:0.9rem;margin-top:12px">Similar runs</div>${similar.map(s => `<div class="similar-run-item" data-id="${s.id}">${s.date} · ${s.distKm} km · ${U.fmtPace(s.paceMinKm)}</div>`).join('')}</div>` : ''}
      <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px" id="actModalActions">
        ${raceActions}
        <a class="export-btn" href="${a.garminUrl}" target="_blank" rel="noopener">View on Garmin</a>
        <a class="export-btn" id="actModalGpxLink" hidden download>Download GPX</a>
      </div>`;
    document.querySelectorAll('.similar-run-item').forEach(el => {
      el.onclick = () => openActModal(findActivity(Number(el.dataset.id)));
      el.style.cursor = 'pointer';
    });
    document.getElementById('modal').classList.add('open');

    loadMarathonTracks().then(() => {
      const track = trackForActivity(a);
      if (!track) return;
      const gpxUrl = mountMarathonRoute(track, { activity: a });
      const gpxLink = document.getElementById('actModalGpxLink');
      if (gpxLink && gpxUrl) {
        gpxLink.href = gpxUrl;
        gpxLink.download = track.sourceFile;
        gpxLink.hidden = false;
      }
      const routeBtn = document.getElementById('actModalRouteBtn');
      if (routeBtn) {
        routeBtn.hidden = false;
        routeBtn.onclick = () => {
          document.getElementById('marathonRouteSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          window._modalRouteMap?.invalidateSize();
        };
      }
    });
  };

  window.refreshActivitiesView = function () {
    const list = getFiltered();
    renderStats(list);
    updateCharts(list);
    renderHeatmap();
    renderTable(list);
  };

  // Default chart years when unset or missing from data
  const years = [...new Set(activities.map(a => a.year))].sort((a, b) => b - a);
  if (years.length) {
    if (!years.includes(window.actMonthChartYear)) window.actMonthChartYear = years[0];
    if (!years.includes(window.actWeekChartYear)) window.actWeekChartYear = years[0];
  }

  renderYearLegend();
  renderMonthChartYearFilters();
  renderMonthLegend();
  renderWeekLegend();
  renderWeekThresholdFilters();
  renderWeekChartYearFilters();
  document.getElementById('actWeekResetBtn')?.addEventListener('click', resetWeekVolumeFilters);
  renderHeatmapFilters();
  renderTableFilters();
  renderMarathonBlockWeekFilters();
  initMarathonBlockSelect();
  renderMarathonBlockDetail();
  renderMarathonBlockTable();
  updateMarathonBlockChart();
  updateMarathonBlockScatter();

  document.getElementById('actMaraBlockExportBtn')?.addEventListener('click', () => exportMarathonBlocksCSV());

  if (window._pendingMarathonBlockKey) {
    selectMarathonBlock(window._pendingMarathonBlockKey);
    window._pendingMarathonBlockKey = null;
    document.getElementById('actSectionBlocks')?.scrollIntoView({ behavior: 'smooth' });
  }

  document.querySelectorAll('#actMaraBlockTable th[data-col]').forEach(th => {
    th.addEventListener('click', e => {
      e.stopPropagation();
      sortMarathonBlocks(th.dataset.col);
    });
  });

  const typeSelect = document.getElementById('actTypeFilter');
  [...new Set(activities.map(a => a.type))].sort().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = U.typeLabel(t);
    typeSelect.appendChild(opt);
  });
  if (window._actRestoreTypeFilter) {
    typeSelect.value = window._actRestoreTypeFilter;
    window._actRestoreTypeFilter = null;
  }

  document.querySelectorAll('#actTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const c = th.dataset.col;
      window.actSortDir = window.actSortCol === c ? window.actSortDir * -1 : 1;
      window.actSortCol = c;
      renderTable(getFiltered());
    });
  });

  ['actSearchInput'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => { window.actPage = 0; refreshActivitiesView(); });
  });
  ['actTypeFilter', 'actPageSize'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      window.actPage = 0;
      refreshActivitiesView();
    });
  });
  document.getElementById('actPrevBtn')?.addEventListener('click', () => { window.actPage--; renderTable(getFiltered()); });
  document.getElementById('actNextBtn')?.addEventListener('click', () => { window.actPage++; renderTable(getFiltered()); });
  document.getElementById('actHeatmapMetric')?.addEventListener('change', () => renderHeatmap());
  document.getElementById('actClearDate')?.addEventListener('click', () => {
    window.actFilterState.date = null;
    document.getElementById('actClearDate').hidden = true;
    renderTableFilters();
    refreshActivitiesView();
  });
  document.getElementById('actCompareToggle')?.addEventListener('change', () => renderTable(getFiltered()));

  async function waitForRacePrediction(maxMs = 5000) {
    const start = Date.now();
    while (!window.RacePrediction && Date.now() - start < maxMs) {
      await new Promise(r => setTimeout(r, 50));
    }
  }

  renderPrCards();
  await waitForRacePrediction();
  initRacePredictions();
  initMap();
  refreshActivitiesView();

  const meta = App.activityMeta;
  if (meta) {
    document.getElementById('actIntro').textContent =
      `Garmin Connect — ${meta.count.toLocaleString()} activities · imported ${meta.importedAt}`;
  }
};
