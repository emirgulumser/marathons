/** Marathon GPX route display (modal map). */
window.marathonRaceKey = function marathonRaceKey(race) {
  return `marathon:${race.name}:${race.year}`;
};

window.marathonRaceKeyFromParts = function marathonRaceKeyFromParts(name, year) {
  return `marathon:${name}:${year}`;
};

window.loadMarathonTracks = async function loadMarathonTracks() {
  if (App._marathonTracksLoaded) return App.marathonTracks || {};
  try {
    const payload = await loadJSON('data/marathon-tracks.json');
    App.marathonTracks = payload.tracks || {};
    App.marathonTracksMeta = payload.meta || null;
  } catch {
    App.marathonTracks = {};
    App.marathonTracksMeta = null;
  }
  App._marathonTracksLoaded = true;
  return App.marathonTracks;
};

window.marathonGpxUrl = function marathonGpxUrl(track) {
  if (!track?.sourceFile) return null;
  return dataUrl(`data/gpx/marathons/${track.sourceFile}`);
};

window.trackForRace = function trackForRace(race) {
  if (!race) return null;
  return App.marathonTracks?.[marathonRaceKey(race)] || null;
};

window.trackForActivity = function trackForActivity(a) {
  if (!a) return null;
  const tracks = App.marathonTracks || {};
  if (a.raceLink?.raceKey && tracks[a.raceLink.raceKey]) return tracks[a.raceLink.raceKey];
  return Object.values(tracks).find(t => t.activityId === a.id) || null;
};

window.trackForMarathon = function trackForMarathon(name, year) {
  return App.marathonTracks?.[marathonRaceKeyFromParts(name, year)] || null;
};

window.marathonRouteMinutes = function marathonRouteMinutes(opts = {}) {
  if (opts.race?.minutes != null) return opts.race.minutes;
  if (opts.activity?.durationSec) return opts.activity.durationSec / 60;
  return 210;
};

window.marathonRouteSectionHtml = function marathonRouteSectionHtml() {
  return `
    <div id="marathonRouteSection" hidden>
      <div class="marathon-route-label">Race route</div>
      <div id="marathonRouteMap" class="marathon-route-map" role="img" aria-label="Marathon course map"></div>
      <p class="marathon-route-meta muted-text" id="marathonRouteMeta"></p>
    </div>`;
};

window.destroyModalRouteMap = function destroyModalRouteMap() {
  if (window._modalRouteMap) {
    window._modalRouteMap.remove();
    window._modalRouteMap = null;
  }
  window._modalRouteLayer = null;
  document.getElementById('modalCard')?.classList.remove('modal-card--wide');
};

window.renderModalRouteMap = function renderModalRouteMap(track, opts = {}) {
  const el = document.getElementById('marathonRouteMap');
  if (!el || !track?.points?.length || typeof L === 'undefined') return;

  destroyModalRouteMap();
  document.getElementById('modalCard')?.classList.add('modal-card--wide');

  const minutes = marathonRouteMinutes(opts);
  const latlngs = track.points.map(p => [p[0], p[1]]);
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const tileUrl = isLight
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  const map = L.map(el, { zoomControl: true, scrollWheelZoom: false });
  window._modalRouteMap = map;
  L.tileLayer(tileUrl, { attribution: '&copy; OSM &copy; CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map);

  const lineColor = minutes < 180 ? '#22c55e' : minutes < 195 ? '#86efac' : minutes >= 240 ? '#ef4444' : '#3b82f6';
  L.polyline(latlngs, { color: lineColor, weight: 4, opacity: 0.9 }).addTo(map);

  const start = latlngs[0];
  const end = latlngs[latlngs.length - 1];
  L.circleMarker(start, { radius: 6, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 1, weight: 2 })
    .bindTooltip('Start', { permanent: false, direction: 'top' })
    .addTo(map);
  L.circleMarker(end, { radius: 6, color: '#f97316', fillColor: '#f97316', fillOpacity: 1, weight: 2 })
    .bindTooltip('Finish', { permanent: false, direction: 'top' })
    .addTo(map);

  map.fitBounds(L.latLngBounds(latlngs), { padding: [18, 18] });
  requestAnimationFrame(() => map.invalidateSize());
};

window.mountMarathonRoute = function mountMarathonRoute(track, opts = {}) {
  if (!track?.points?.length) return '';
  const section = document.getElementById('marathonRouteSection');
  const meta = document.getElementById('marathonRouteMeta');
  if (section) section.hidden = false;
  const gpxUrl = marathonGpxUrl(track);
  if (meta) {
    const gpxLink = gpxUrl
      ? ` · <a href="${gpxUrl}" download="${track.sourceFile}">Download GPX</a>`
      : '';
    meta.innerHTML = `${track.distKm} km logged · ${track.simplifiedCount.toLocaleString()} points on map${gpxLink}`;
  }
  requestAnimationFrame(() => renderModalRouteMap(track, opts));
  return gpxUrl;
};

window.openMarathonRouteModal = async function openMarathonRouteModal(raceName, raceYear) {
  await loadMarathonTracks();
  const track = trackForMarathon(raceName, raceYear);
  if (!track) return;
  const activity = App.activities?.find(a => a.id === track.activityId);
  if (activity && typeof openActModal === 'function') {
    openActModal(activity);
    return;
  }
  const race = App.races?.find(r => r.name === raceName && r.year === raceYear);
  if (race && typeof openModal === 'function') openModal(race);
};
