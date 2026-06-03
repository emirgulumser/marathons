import fs from 'fs';

const monolith = fs.readFileSync('index.monolith.bak', 'utf8');
const js = monolith.match(/<script>([\s\S]*?)<\/script>/)[1];

function extract(startLabel, endLabel) {
  const start = js.indexOf(startLabel);
  const end = js.indexOf(endLabel);
  let block = js.slice(start, end).trim();
  block = block.replace(/^\/\*[\s\S]*?\*\/\n?/, '');
  block = block.replace(/\(function\(\) \{\s*/, '').replace(/\(function\(\)\{\s*/, '');
  block = block.replace(/\}\)\(\);\s*$/, '');
  return block.replace(/\braces\b/g, 'App.races');
}

const latBlock = extract('   LATITUDE CHARTS', '   CONSISTENCY SCORE')
  .replace(/const lats = \[[\s\S]*?App\.races\.forEach\(\(r, i\) => \{ r\.lat = lats\[i\]; \}\);\s*/, '');

const lngBlock = extract('   LONGITUDE CHART', '   LATITUDE DISTANCE FROM HOME')
  .replace(/const lngs=\[[\s\S]*?App\.races\.forEach\(\(r,i\)=>\{ r\.lng=lngs\[i\]; \}\);\s*/, '');

const combined = `(function() {
  const races = App.races;
${latBlock}
})();

(function() {
  const races = App.races;
${lngBlock}
})();

`;

let m = fs.readFileSync('js/marathons-tab.js', 'utf8');
const marker = '(function(){\r\n  const groups={};';
let insertAt = m.indexOf(marker);
if (insertAt === -1) insertAt = m.indexOf('(function(){\n  const groups={};');
if (insertAt === -1) throw new Error('insert point not found');

m = m.slice(0, insertAt) + combined + m.slice(insertAt);
fs.writeFileSync('js/marathons-tab.js', m);
console.log('Inserted charts');
