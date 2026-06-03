/** Race detail modals — loaded once, not redefined on tab init. */
window.openModal = function openModal(race) {
  const c = App.countryMap[race.country] || { name: race.country };
  const yearRaces = [...App.races.filter(r => r.year === race.year)].sort((a, b) => a.minutes - b.minutes);
  const yearRank = yearRaces.indexOf(race) + 1;
  const tc = race.minutes < 180 ? '#22c55e' : race.minutes < 195 ? '#86efac' : race.minutes >= 240 ? '#ef4444' : '#3b82f6';
  const pb = App.stats?.pbMinutes ?? Math.min(...App.races.map(r => r.minutes));

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
    </div>`;
  document.getElementById('modal').classList.add('open');
};

window.closeModal = function closeModal(e) {
  if (!e || e.target === document.getElementById('modal') || e.target.classList?.contains('modal-close')) {
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
