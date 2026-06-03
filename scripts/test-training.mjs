import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve('.');
const elements = new Map();
function makeEl(tag) {
  return {
    tagName: tag.toUpperCase(), style: {}, className: '', innerHTML: '', textContent: '',
    classList: { add: () => {}, remove: () => {} }, addEventListener: () => {},
    appendChild() {}, getContext: () => ({}),
    parentElement: { insertBefore: () => {}, firstChild: null },
  };
}
global.window = global;
global.document = {
  documentElement: { getAttribute: () => 'dark', setAttribute: () => {} },
  createElement: (tag) => makeEl(tag),
  getElementById: (id) => {
    if (!elements.has(id)) elements.set(id, makeEl('div'));
    return elements.get(id);
  },
  addEventListener: () => {},
  body: { insertAdjacentHTML: () => {} },
  querySelectorAll: () => [],
  querySelector: () => ({ dataset: { tab: 'training' } }),
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Chart = class { constructor() {} update() {} };
Chart.defaults = { color: '', borderColor: '' };
global.L = { map: () => ({ setView: () => {}, invalidateSize: () => {} }), tileLayer: () => ({ addTo: () => {} }), circleMarker: () => ({ addTo: () => {}, bindPopup: () => {}, on: () => {} }), marker: () => ({ addTo: () => {} }), divIcon: () => ({}) };
global.fetch = async (url) => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url.replace(/^\//, '')), 'utf8')) });

for (const f of ['js/utils.js','js/store.js','js/theme.js','js/tabs.js','js/export.js','js/goals.js','js/marathons-tab.js','js/half-tab.js','js/training-tab.js','js/trail-tab.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

await loadAppData();
initTrainingTab();
console.log('training tab OK');
