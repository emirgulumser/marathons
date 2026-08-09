/** Tab navigation with lazy chart initialization. */
const TAB_INIT = {
  marathons: () => window.initMarathonsTab?.(),
  half: () => window.initHalfTab?.(),
  trail: () => window.initTrailTab?.(),
  training: () => window.initTrainingTab?.(),
  activities: () => { window.initActivitiesTab?.(); },
};

window.switchTab = function switchTab(name, opts = {}) {
  const prevTab = document.querySelector('.tab-content.active')?.id?.replace('tab-', '');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${name}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');

  if (prevTab === 'activities' && name !== 'activities') {
    window.pauseActMapHeat?.();
  }

  if (name === 'activities' && opts.marathonKey) {
    window._pendingMarathonBlockKey = opts.marathonKey;
    window.actMarathonBlockKey = opts.marathonKey;
  }

  TAB_INIT[name]?.();

  if (name === 'activities' && opts.marathonKey && window._activitiesTabInit) {
    window.selectMarathonBlock?.(opts.marathonKey);
    document.getElementById('actSectionBlocks')?.scrollIntoView({ behavior: 'smooth' });
  }

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    window.leafletMap?.invalidateSize();
    window.halfMapRef?.invalidateSize();
    window.actMapRef?.invalidateSize();
    if (name === 'activities') window.refreshActMapHeat?.();
  }, 50);
};

window.initActiveTab = function initActiveTab() {
  const active = document.querySelector('.tab-btn.active')?.dataset.tab || 'marathons';
  TAB_INIT[active]?.();
};
