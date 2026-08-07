import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve('.');

const elements = new Map();
const makeEl = () => ({
  style: {}, className: '', innerHTML: '', textContent: '', hidden: false, value: '',
  classList: { add: () => {}, remove: () => {} },
  addEventListener: () => {},
  appendChild(c) { if (!this.children) this.children = []; this.children.push(c); },
  getContext: () => ({}),
  parentElement: { insertBefore: () => {}, firstChild: null },
  children: [],
  dataset: {},
  options: [],
  selectedIndex: 0,
});

global.window = global;
global.APP_ROOT = 'file:///' + root.replace(/\\/g, '/') + '/';
global.document = {
  baseURI: APP_ROOT,
  documentElement: { getAttribute: () => 'dark', setAttribute: () => {} },
  createElement: () => makeEl(),
  getElementById: (id) => {
    if (!elements.has(id)) elements.set(id, makeEl());
    return elements.get(id);
  },
  addEventListener: () => {},
  body: { insertAdjacentHTML: () => {} },
  querySelectorAll: () => [],
  querySelector: () => ({ dataset: { tab: 'marathons' } }),
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Chart = class { constructor() {} update() {} };
Chart.defaults = { color: '', borderColor: '' };
Chart.register = () => {};
global.L = {
  map: () => ({ setView: () => {}, addTo: () => {}, remove: () => {}, invalidateSize: () => {}, fitBounds: () => {}, removeLayer: () => {} }),
  tileLayer: () => ({ addTo: () => {}, setUrl: () => {}, remove: () => {} }),
  circleMarker: () => ({ addTo: () => {}, bindPopup: () => {}, on: () => {} }),
  marker: () => ({ addTo: () => {} }),
  divIcon: () => ({}),
  latLngBounds: () => ({ isValid: () => false }),
  heatLayer: () => ({ addTo: () => {} }),
};
global.fetch = async (url) => {
  const rel = url.includes('data/') ? url.slice(url.indexOf('data/')) : url;
  const file = rel.replace(/\?.*$/, '');
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) };
};

const files = [
  'js/config.js', 'js/utils.js', 'js/store.js', 'js/theme.js', 'js/modal.js',
  'js/tabs.js', 'js/export.js', 'js/goals.js', 'js/marathons-tab.js',
  'js/half-tab.js', 'js/training-tab.js', 'js/trail-tab.js',
  'js/activities-utils.js', 'js/activities-tab.js', 'js/app.js',
];

for (const f of files) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

await loadAppData();
await loadActivities();
initActiveTab();
console.log('LOCAL OK', App.stats.pbTime, 'activities', App.activities.length, 'summary', !!App.activitySummary);
