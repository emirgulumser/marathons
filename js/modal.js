/** Race detail modals — loaded once, not redefined on tab init. */
window.openModal = function openModal(race) {
  destroyModalRouteMap();
  const c = App.countryMap[race.country] || { name: race.country };
  const yearRaces = [...App.races.filter(r => r.year === race.year)].sort((a, b) => a.minutes - b.minutes);
  const yearRank = yearRaces.indexOf(race) + 1;
  const tc = race.minutes < 180 ? '#22c55e' : race.minutes < 195 ? '#86efac' : race.minutes >= 240 ? '#ef4444' : '#3b82f6';
  const pb = App.stats?.pbMinutes ?? Math.min(...App.races.map(r => r.minutes));
  const RW = window.RaceWeather;
  const weatherBlock = race.weather && RW ? `
    <div class="modal-section-title">Race-time weather${race.weather.windowStart ? ` (${race.weather.windowStart}–${race.weather.windowEnd}${race.weather.windowSource === 'garmin' ? ' · Garmin' : race.weather.windowSource === 'official' ? ' · official start' : ''})` : ''}</div>
    <div class="modal-grid">
      <div class="modal-stat-box">
        <div class="modal-stat-label">Race window</div>
        <div class="modal-stat-val">${race.weather.windowStart || '—'}–${race.weather.windowEnd || '—'}${race.weather.windowSource === 'garmin' ? ' · Garmin' : race.weather.windowSource === 'official' ? ' · Official' : ''}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Conditions</div>
        <div class="modal-stat-val">${race.weather.conditions}${race.raceDate ? ` · ${race.raceDate}` : ''}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Temperature</div>
        <div class="modal-stat-val">${race.weather.tempMin != null && race.weather.tempMax != null ? `${Math.round(race.weather.tempMin)}–${Math.round(race.weather.tempMax)}°C` : `${Math.round(race.weather.tempC)}°C`} · ${race.weather.humidity}% humidity</div>
        ${race.weather.weatherNote ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:6px">${race.weather.weatherNote}</div>` : ''}
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Feels like</div>
        <div class="modal-stat-val">${race.difficulty?.wbgt != null ? `WBGT ${race.difficulty.wbgt}°C` : '—'}${race.difficulty?.dewPoint != null ? ` · Dew ${race.difficulty.dewPoint}°C` : ''}${race.difficulty?.windChill != null ? ` · Wind chill ${race.difficulty.windChill}°C` : race.difficulty?.heatIndex != null && race.difficulty.heatIndex > race.weather.tempC + 0.5 ? ` · Heat index ${race.difficulty.heatIndex}°C` : ''}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Wind</div>
        <div class="modal-stat-val">${Math.round(race.weather.windKph)} km/h avg${race.weather.windMaxKph ? ` · ${Math.round(race.weather.windMaxKph)} km/h max` : ''}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Rain / Snow</div>
        <div class="modal-stat-val">${race.weather.rainMm} mm rain · ${race.weather.snowCm} cm snow</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Difficulty</div>
        <div class="modal-stat-val" style="color:${race.difficulty?.color || 'inherit'}">${race.difficulty?.score ?? '—'} · ${race.difficulty?.label ?? '—'}</div>
      </div>
    </div>
    ${race.difficulty?.factors?.length ? `<div class="difficulty-factors">${race.difficulty.factors.map(f => `<span class="difficulty-factor">${f.label} +${f.value}</span>`).join('')}</div>` : ''}` : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-flag">${flagImgHtml(race.country, 48)}</div>
    <div class="modal-title">${race.name}</div>
    <div class="modal-subtitle">${race.year} · ${c.name}${race.major ? ' · <span class="major-badge">⭐ World Major</span>' : ''}</div>
    <div class="modal-time" style="color:${tc}">${race.time}</div>
    ${race.isPB ? '<div style="color:#fbbf24;font-weight:700;margin-bottom:8px">🏆 Personal Best at the time!</div>' : ''}
    <div class="modal-grid">
      <div class="modal-stat-box">
        <div class="modal-stat-label">Overall Rank</div>
        <div class="modal-stat-val">#${race.rank} / ${App.races.length}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Rank in ${race.year}</div>
        <div class="modal-stat-val">#${yearRank} / ${yearRaces.length}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Gap to PB</div>
        <div class="modal-stat-val">+${fmtTime(race.minutes - pb)}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Time bucket</div>
        <div class="modal-stat-val">${race.minutes < 175 ? 'Elite sub-2:55' : race.minutes < 180 ? 'Sub-3:00' : race.minutes < 195 ? 'Strong' : race.minutes < 210 ? 'Solid' : race.minutes < 240 ? 'Steady' : 'Tough day'}</div>
      </div>
    </div>
    ${weatherBlock}
    ${marathonRouteSectionHtml()}
    ${typeof gpxChartsSectionHtml === 'function' ? gpxChartsSectionHtml() : ''}
    <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px" id="marathonModalActions">
      <button type="button" class="export-btn" onclick="closeModal();openMarathonTrainingBlock('${race.name.replace(/'/g, "\\'")}',${race.year})">View 12-week build</button>
    </div>`;
  document.getElementById('modal').classList.add('open');

  loadMarathonTracks().then(tracks => {
    const track = tracks[marathonRaceKey(race)];
    if (!track) return;
    mountMarathonRoute(track, { race });
    const actions = document.getElementById('marathonModalActions');
    if (actions && !actions.querySelector('[data-activity-page]')) {
      const href = activityPageUrl({ activityId: track.activityId, raceName: race.name, raceYear: race.year });
      actions.insertAdjacentHTML('afterbegin',
        `<a class="export-btn" data-activity-page href="${href}">Open activity page</a>`);
    }
    if (typeof mountGpxCharts === 'function') mountGpxCharts(track);
  });
};

window.closeModal = function closeModal(e) {
  if (!e || e.target === document.getElementById('modal') || e.target.classList?.contains('modal-close')) {
    destroyModalRouteMap();
    document.getElementById('modal')?.classList.remove('open');
  }
};

window.openHeatmapModal = function openHeatmapModal(year, countryCode) {
  const c = App.countryMap[countryCode] || { name: countryCode };
  const list = App.races
    .filter(r => r.year === year && r.country === countryCode)
    .sort((a, b) => a.minutes - b.minutes);
  if (!list.length) return;

  const avgMin = Math.round(list.reduce((s, r) => s + r.minutes, 0) / list.length);

  const rows = list.map(r => `
    <div onclick="closeModal();setTimeout(()=>openModal(App.races[${r.idx - 1}]),120)"
         style="background:var(--card2);border:1px solid var(--border);border-radius:10px;
                padding:13px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;
                transition:border-color 0.15s"
         onmouseover="this.style.borderColor='#f97316'"
         onmouseout="this.style.borderColor='var(--border)'">
      <div style="flex:1">
        <div style="font-weight:700;font-size:0.95rem">${r.name}${r.major ? ` <span class="major-badge">⭐</span>` : ''}</div>
        <div style="font-size:0.75rem;color:var(--muted);margin-top:3px">#${r.rank} fastest overall · click for full detail</div>
      </div>
      <div style="font-size:1.25rem;font-weight:800;color:${timeColor(r.minutes)};font-variant-numeric:tabular-nums">${r.time}</div>
    </div>`).join('');

  const summary = list.length > 1 ? `
    <div class="modal-grid" style="margin-top:16px">
      <div class="modal-stat-box">
        <div class="modal-stat-label">Best</div>
        <div class="modal-stat-val" style="color:#22c55e">${list[0].time}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Average</div>
        <div class="modal-stat-val">${fmtTime(avgMin)}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Slowest</div>
        <div class="modal-stat-val" style="color:var(--muted)">${list[list.length - 1].time}</div>
      </div>
      <div class="modal-stat-box">
        <div class="modal-stat-label">Races</div>
        <div class="modal-stat-val">${list.length}</div>
      </div>
    </div>` : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modal-flag">${flagImgHtml(countryCode, 48)}</div>
    <div class="modal-title">${c.name}</div>
    <div class="modal-subtitle">${year} · ${list.length} race${list.length > 1 ? 's' : ''}</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px">${rows}</div>
    ${summary}`;

  document.getElementById('modal').classList.add('open');
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
