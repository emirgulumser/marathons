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
    await loadAppData();
    updateHeaderFooter();
    renderGoals();
    initActiveTab();
  } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:#ef4444;color:#fff;padding:12px 24px;text-align:center">Failed to load data: ${err.message}. Serve via a local HTTP server.</div>`
    );
  }
});

window.closeModal = window.closeModal || function closeModal(e) {
  if (!e || e.target === document.getElementById('modal') || e.target.classList?.contains('modal-close')) {
    document.getElementById('modal')?.classList.remove('open');
  }
};

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});
