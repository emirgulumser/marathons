import fs from 'fs';
import vm from 'vm';
import path from 'path';

const root = path.resolve('.');

const elements = new Map();
function makeEl(tag) {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    className: '',
    innerHTML: '',
    textContent: '',
    title: '',
    onclick: null,
    children: [],
    classList: { add: () => {}, remove: () => {} },
    addEventListener: () => {},
    appendChild(c) { this.children.push(c); },
    setAttribute: () => {},
    getContext: () => ({}),
    parentElement: { insertBefore: () => {}, firstChild: null },
  };
}

global.window = global;
global.document = {
  documentElement: { getAttribute: () => 'dark', setAttribute: () => {} },
  createElement: (tag) => makeEl(tag),
  getElementById: (id) => {
    if (!elements.has(id)) {
      const el = makeEl('div');
      el.id = id;
      if (id.includes('Chart') || id === 'progressChart') el.getContext = () => ({});
      if (id === 'worldMap' || id === 'halfMap') el.setView = () => {};
      elements.set(id, el);
    }
    return elements.get(id);
  },
  addEventListener: () => {},
  body: { insertAdjacentHTML: () => {} },
  querySelectorAll: (sel) => {
    if (sel.includes('th[data-col]') || sel.includes('#halfTable')) return [];
    if (sel.includes('filter-btn')) return [];
    if (sel.includes('tab-btn')) return [{ dataset: { tab: 'marathons' }, classList: { add: () => {}, remove: () => {} } }];
    if (sel.includes('tab-content')) return [];
    return [];
  },
  querySelector: (sel) => {
    if (sel.includes('tab-btn')) return { dataset: { tab: 'marathons' } };
    return null;
  },
};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.Chart = class {
  constructor() {}
  update() {}
};
Chart.defaults = { color: '', borderColor: '' };
global.L = {
  map: () => ({
    setView: () => {},
    addTo: () => {},
    remove: () => {},
    invalidateSize: () => {},
  }),
  tileLayer: () => ({ addTo: () => {}, setUrl: () => {}, remove: () => {} }),
  circleMarker: () => ({ addTo: () => {}, bindPopup: () => {}, on: () => {} }),
  marker: () => ({ addTo: () => {} }),
  divIcon: () => ({}),
};
global.fetch = async (url) => {
  const p = url.replace(/^\//, '');
  return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')) };
};

const files = [
  'js/utils.js', 'js/store.js', 'js/theme.js', 'js/tabs.js', 'js/export.js', 'js/goals.js',
  'js/marathons-tab.js', 'js/half-tab.js', 'js/training-tab.js', 'js/trail-tab.js', 'js/app.js',
];

for (const f of files) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}

try {
  await loadAppData();
  initActiveTab();
  console.log('SUCCESS');
} catch (e) {
  console.error('FAIL:', e.message);
  console.error(e.stack);
  process.exit(1);
}
