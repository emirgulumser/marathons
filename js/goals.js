/** Goals & milestones section. */
window.renderGoals = function renderGoals() {
  const el = document.getElementById('goalsGrid');
  if (!el || !App.goals) return;

  const s = App.stats;
  const metrics = {
    marathons: s.marathonCount,
    sub3: s.sub3Count,
    countries: s.countryCount,
    marathon_pb: s.pbMinutes,
    training_km: s.totalTrainingKm,
    majors_complete: s.majorsComplete,
  };

  el.innerHTML = App.goals.targets.map(t => {
    const current = metrics[t.metric] ?? 0;
    let done = false;
    let progress = 0;
    let detail = '';

    if (t.type === 'boolean' || t.type === 'count') {
      done = current >= t.target;
      progress = Math.min(100, Math.round((current / t.target) * 100));
      detail = `${current.toLocaleString()} / ${t.target.toLocaleString()}`;
    } else if (t.type === 'pb') {
      done = current <= t.target;
      progress = done ? 100 : Math.max(0, Math.min(99, Math.round((1 - (current - t.target) / 30) * 100)));
      detail = done ? `PB ${fmtTime(current)} ✓` : `PB ${fmtTime(current)} → target ${fmtTime(t.target)}`;
    }

    return `
      <div class="goal-card${done ? ' achieved' : ''}">
        <div class="goal-icon">${done ? '✅' : '🎯'}</div>
        <div class="goal-body">
          <div class="goal-label">${escapeHtml(t.label)}</div>
          <div class="goal-detail">${escapeHtml(detail)}</div>
          <div class="goal-bar"><div class="goal-fill" style="width:${progress}%"></div></div>
        </div>
      </div>`;
  }).join('');
};
