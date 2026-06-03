import https from 'https';
import vm from 'vm';

const base = 'https://emirgulumser.github.io/marathons';

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      let d = '';
      r.on('data', (c) => { d += c; });
      r.on('end', () => resolve({ ok: r.statusCode === 200, status: r.statusCode, text: d }));
    }).on('error', reject);
  });
}

const elements = new Map();
const makeEl = () => ({
  style: {}, className: '', innerHTML: '', textContent: '',
  classList: { add: () => {}, remove: () => {} }, addEventListener: () => {},
  appendChild: () => {}, getContext: () => ({}),
  parentElement: { insertBefore: () => {}, firstChild: null },
});

global.window = global;
global.document = {
  documentElement: { getAttribute: () => 'dark', setAttribute: () => {} },
  createElement: makeEl,
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
global.L = {
  map: () => ({ setView: () => {}, addTo: () => {}, remove: () => {}, invalidateSize: () => {} }),
  tileLayer: () => ({ addTo: () => {}, setUrl: () => {}, remove: () => {} }),
  circleMarker: () => ({ addTo: () => {}, bindPopup: () => {}, on: () => {} }),
  marker: () => ({ addTo: () => {} }),
  divIcon: () => ({}),
};
global.fetch = async (url) => {
  const r = await fetchText(`${base}/${url.replace(/^\//, '')}`);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return { ok: true, json: async () => JSON.parse(r.text) };
};

const files = [
  'js/utils.js', 'js/store.js', 'js/theme.js', 'js/tabs.js', 'js/export.js', 'js/goals.js',
  'js/marathons-tab.js', 'js/half-tab.js', 'js/training-tab.js', 'js/trail-tab.js', 'js/app.js',
];

for (const f of files) {
  const r = await fetchText(`${base}/${f}`);
  vm.runInThisContext(r.text, { filename: f });
}

await loadAppData();
initActiveTab();
console.log('LIVE JS OK', App.stats);
