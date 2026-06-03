/** Tab navigation with lazy chart initialization. */
const TAB_INIT = {
  marathons: () => window.initMarathonsTab?.(),
  half: () => window.initHalfTab?.(),
  trail: () => window.initTrailTab?.(),
  training: () => window.initTrainingTab?.(),
};

window.switchTab = function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${name}"]`)?.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${name}`)?.classList.add('active');

  TAB_INIT[name]?.();

  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    window.leafletMap?.invalidateSize();
    window.halfMapRef?.invalidateSize();
  }, 50);
};

window.initActiveTab = function initActiveTab() {
  const active = document.querySelector('.tab-btn.active')?.dataset.tab || 'marathons';
  TAB_INIT[active]?.();
};
