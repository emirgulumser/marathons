/** Theme toggle with localStorage persistence. */
window.leafletMap = null;
window.leafletDarkLayer = null;
window.leafletLightLayer = null;
window.halfMapRef = null;
window.halfTileLayer = null;

const THEME_KEY = 'marathons-theme';

function applyTheme(isDark) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = isDark ? '🌙 Dark' : '☀️ Light';

  if (window.leafletMap && window.leafletDarkLayer && window.leafletLightLayer) {
    if (isDark) {
      window.leafletLightLayer.remove();
      window.leafletDarkLayer.addTo(window.leafletMap);
    } else {
      window.leafletDarkLayer.remove();
      window.leafletLightLayer.addTo(window.leafletMap);
    }
  }

  const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightTile = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  if (window.halfTileLayer) {
    window.halfTileLayer.setUrl(isDark ? darkTile : lightTile);
  }
}

window.toggleTheme = function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const next = !isDark;
  localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  applyTheme(next);
};

window.initTheme = function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const isDark = saved ? saved === 'dark' : true;
  applyTheme(isDark);
};
