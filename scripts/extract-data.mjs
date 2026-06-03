import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const racesMatch = html.match(/const races = \[([\s\S]*?)\];/);
const countryMatch = html.match(/const countryData = \[([\s\S]*?)\];/);
const latsMatch = html.match(/const lats = \[([\s\S]*?)\];/);
const lngsMatch = html.match(/const lngs=\[([\s\S]*?)\];/);
const trailsMatch = html.match(/const trails = \[([\s\S]*?)\];/);
const logMatch = html.match(/const log = \[([\s\S]*?)\];/);

let races, countryData, lats, lngs, trails, log;
eval(`races = [${racesMatch[1]}];`);
eval(`countryData = [${countryMatch[1]}];`);
eval(`lats = [${latsMatch[1]}];`);
eval(`lngs = [${lngsMatch[1]}];`);
eval(`trails = [${trailsMatch[1]}];`);
eval(`log = [${logMatch[1]}];`);

const marathons = races.map((r, i) => ({ ...r, lat: lats[i], lng: lngs[i] }));
const countries = countryData.map(({ code, name, lat, lng }) => ({ code, name, lat, lng }));

const halves = [
  { name: 'Adana', year: 2017, time: '1:32', country: 'TUR', lat: 37.00, lng: 35.32 },
  { name: 'Adana', year: 2019, time: '1:30', country: 'TUR', lat: 37.00, lng: 35.32 },
  { name: 'Ankara', year: 2016, time: '1:28', country: 'TUR', lat: 39.93, lng: 32.86 },
  { name: 'Ankara', year: 2020, time: '1:31', country: 'TUR', lat: 39.93, lng: 32.86 },
  { name: 'Amsterdam', year: 2022, time: '1:26', country: 'NED', lat: 52.37, lng: 4.90 },
  { name: 'Amsterdam', year: 2024, time: '1:27', country: 'NED', lat: 52.37, lng: 4.90 },
  { name: 'İzmir', year: 2018, time: '1:29', country: 'TUR', lat: 38.42, lng: 27.14 },
  { name: 'İzmir', year: 2023, time: '1:33', country: 'TUR', lat: 38.42, lng: 27.14 },
  { name: 'Hawaii', year: 2018, time: '1:35', country: 'USA', lat: 21.31, lng: -157.80 },
  { name: 'Ghent', year: 2023, time: '1:34', country: 'BEL', lat: 51.05, lng: 3.72 },
  { name: 'Giresun', year: 2021, time: '1:36', country: 'TUR', lat: 40.92, lng: 38.39 },
  { name: 'Bodrum', year: 2017, time: '1:38', country: 'TUR', lat: 37.03, lng: 27.43 },
  { name: 'Çeşme', year: 2022, time: '1:32', country: 'TUR', lat: 38.32, lng: 26.30 },
];

const goals = {
  targetMarathonMinutes: 170,
  targets: [
    { id: 'marathons-100', label: '100 Marathons', type: 'count', metric: 'marathons', target: 100 },
    { id: 'sub3-50', label: '50 Sub-3 Finishes', type: 'count', metric: 'sub3', target: 50 },
    { id: 'countries-25', label: '25 Countries', type: 'count', metric: 'countries', target: 25 },
    { id: 'pb-250', label: 'Sub-2:50 Marathon', type: 'pb', metric: 'marathon_pb', target: 170 },
    { id: 'training-40k', label: '40,000 km Lifetime', type: 'count', metric: 'training_km', target: 40000 },
    { id: 'majors', label: 'All 6 World Majors', type: 'boolean', metric: 'majors_complete', target: 6 },
  ],
};

const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(path.join(dataDir, 'marathons.json'), JSON.stringify(marathons, null, 2));
fs.writeFileSync(path.join(dataDir, 'countries.json'), JSON.stringify(countries, null, 2));
fs.writeFileSync(path.join(dataDir, 'half-marathons.json'), JSON.stringify(halves, null, 2));
fs.writeFileSync(path.join(dataDir, 'trails.json'), JSON.stringify(trails, null, 2));
fs.writeFileSync(path.join(dataDir, 'training.json'), JSON.stringify(log, null, 2));
fs.writeFileSync(path.join(dataDir, 'goals.json'), JSON.stringify(goals, null, 2));
console.log('Done:', marathons.length, 'marathons');
