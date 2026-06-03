/** Application bootstrap. */
window.updateHeaderFooter = function updateHeaderFooter() {
  const s = App.stats;
  const tagline = document.getElementById('headerTagline');
  if (tagline) {
    tagline.textContent = `${s.marathonCount} marathons · ${s.countryCount} countries · ${s.totalTrainingKm.toLocaleString()} km · 6 World Majors`;
  }
  const footer = document.getElementById('footerStats');
  if (footer) {
    footer.innerHTML = `🏅 ${s.marathonCount} Marathons &nbsp;·&nbsp; ⛰️ ${s.trailCount} Trail Races &nbsp;·&nbsp; 🌍 ${s.countryCount} Countries &nbsp;·&nbsp; 📏 ${s.totalTrainingKm.toLocaleString()} km total`;
  }
  const passportTitle = document.getElementById('passportTitle');
  if (passportTitle) {
    passportTitle.textContent = `Country Passport — ${s.countryCount} nations`;
  }
  const timelineTitle = document.getElementById('timelineTitle');
  if (timelineTitle) {
    timelineTitle.textContent = `Performance Timeline — all ${s.marathonCount} races`;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  try {
    const ap = window.annotationPlugin || window['chartjs-plugin-annotation'];
    if (typeof Chart !== 'undefined' && ap && Chart.register) Chart.register(ap);
  } catch (_) { /* annotation plugin optional */ }
  try {
    await loadAppData();
    updateHeaderFooter();
    renderGoals();
    initActiveTab();
  } catch (err) {
    console.error(err);
    const hint = err.message.includes('Failed to load')
      ? 'Check that data files exist and hard-refresh (Ctrl+Shift+R).'
      : 'Hard-refresh the page (Ctrl+Shift+R) to clear cached scripts.';
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:#ef4444;color:#fff;padding:12px 24px;text-align:center">Failed to load: ${err.message}. ${hint}</div>`
    );
  }
});
