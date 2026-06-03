window.initMarathonsTab = function () {
  if (window._marathonsTabInit) return;
  window._marathonsTabInit = true;

let pb = Infinity;
App.races.forEach((r, i) => {
  r.idx = i + 1;
  if (r.minutes == null) r.minutes = parseTime(r.time);
  r.isPB = r.minutes < pb;
  if (r.isPB) pb = r.minutes;
});
if (!App.races[0]?.rank) {
  const sortedByTime = [...App.races].sort((a, b) => a.minutes - b.minutes);
  App.races.forEach(r => { r.rank = sortedByTime.indexOf(r) + 1; });
}
App.stats.pbMinutes = pb;
App.countryMap = {};
App.countryData.forEach(c => { App.countryMap[c.code] = c; });
const races = App.races;
const countryData = App.countryData;
const countryMap = App.countryMap;
const log = App.log;
const logKm = App.logKm;
const logKm2 = App.logKm;


const sub3Count  = App.races.filter(r=>r.minutes<180).length;
const totalMins  = App.races.reduce((s,r)=>s+r.minutes,0);
const totalHours = Math.floor(totalMins/60);
const totalRem   = totalMins%60;
const avgMins    = Math.round(totalMins/App.races.length);

document.getElementById('sSub3').textContent  = sub3Count;
const pbMin = Math.min(...App.races.map(r => r.minutes));
document.getElementById('sTotal').textContent = App.races.length;
document.getElementById('sCountries').textContent = App.countryData.length;
document.getElementById('sPB').textContent = fmtTime(pbMin);
document.getElementById('sMajors').textContent = App.races.filter(r => r.major).length;
document.getElementById('sKm').textContent    = Math.round(App.races.length * 42.195).toLocaleString();
document.getElementById('sTime').textContent  = `${totalHours}h`;
document.getElementById('sAvg').textContent   = fmtTime(avgMins);

Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(48,54,61,0.5)';

const chartOpts = (extra={}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend:{ display:false }, tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12 } },
  ...extra
});
const yTimeScale = (min=160, max=275) => ({
  min, max,
  grid: { color:'rgba(255,255,255,0.05)' },
  ticks: { color:'#8b949e', callback: v=>fmtTime(v) }
});


(function() {
  const ctx = document.getElementById('progressChart').getContext('2d');
  const labels = App.races.map(r=>`${r.name} ${r.year}`);
  const data   = App.races.map(r=>r.minutes);

  const ptColors = App.races.map(r => r.isPB?'#fbbf24': r.major?'#a78bfa': r.minutes<180?'#22c55e': r.minutes>=240?'#ef4444':'#3b82f6');
  const ptSizes  = App.races.map(r => r.isPB?10: r.major?8: 5);
  const ptStyles = App.races.map(r => r.isPB?'star':'circle');

  const wSize=5;
  const rollAvg = data.map((_,i)=>{
    const sl = data.slice(Math.max(0,i-wSize+1),i+1);
    return Math.round(sl.reduce((a,b)=>a+b,0)/sl.length);
  });

  new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Time', data, borderColor:'rgba(99,120,180,0.35)', borderWidth:1.5,
          pointBackgroundColor:ptColors, pointBorderColor:ptColors,
          pointRadius:ptSizes, pointHoverRadius:10, pointStyle:ptStyles,
          tension:0.3, fill:false, order:1 },
        { label:'Rolling avg', data:rollAvg, borderColor:'#f97316', borderWidth:2.5,
          borderDash:[6,3], pointRadius:0, tension:0.4, fill:false, order:0 }
      ]
    },
    options:{
      ...chartOpts(),
      onClick(e,els){ if(els.length){ openModal(App.races[els[0].index]); } },
      plugins:{
        legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{
            title: items=>labels[items[0].dataIndex],
            label: item=>{
              if(item.datasetIndex===0){
                const r=App.races[item.dataIndex];
                return ` ${r.time}${r.isPB?' 🏆 PB':''}${r.major?' ⭐ Major':''}`;
              }
              return ` Rolling avg: ${fmtTime(item.raw)}`;
            }
          }
        },
        annotation:{
          annotations:{
            target:{ type:'line', yMin:170, yMax:170,
              borderColor:'rgba(251,191,36,0.5)', borderWidth:1.5, borderDash:[5,5],
              label:{ content:'2:50 target', display:true, position:'end',
                backgroundColor:'transparent', color:'#fbbf24', font:{size:10} } }
          }
        }
      },
      scales:{
        x:{ ticks:{display:false}, grid:{color:'rgba(255,255,255,0.03)'} },
        y: yTimeScale()
      }
    }
  });
})();


(function() {
  const ctx = document.getElementById('pbChart').getContext('2d');
  let curPB = Infinity;
  const pbPoints = [];
  App.races.forEach((r,i) => {
    if(r.minutes < curPB){ curPB=r.minutes; pbPoints.push({x:i+1, y:curPB, race:r}); }
  });

  // Build stepped data: for each race index, what was the PB at that point?
  let best = Infinity;
  const pbLine = App.races.map((r,i) => {
    if(r.minutes < best) best = r.minutes;
    return best;
  });

  new Chart(ctx, {
    type:'line',
    data:{
      labels: App.races.map(r=>`${r.name} ${r.year}`),
      datasets:[
        { label:'PB level', data:pbLine, stepped:'after',
          borderColor:'#fbbf24', borderWidth:2.5,
          backgroundColor:'rgba(251,191,36,0.08)',
          pointRadius:0, fill:true, tension:0 },
        { label:'PB set', data:pbPoints.map(p=>({ x:p.x-1, y:p.y })),
          borderColor:'transparent', backgroundColor:'#fbbf24',
          pointRadius:8, pointStyle:'star', showLine:false }
      ]
    },
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          filter: i=>i.datasetIndex===1,
          callbacks:{ title:()=>'Personal Best', label: i=>{
            const r=pbPoints[i.dataIndex]?.race;
            return r?` ${r.name} ${r.year} — ${r.time}`:'';
          }}
        }
      },
      scales:{
        x:{ ticks:{display:false}, grid:{color:'rgba(255,255,255,0.03)'} },
        y: yTimeScale(160,230)
      }
    }
  });
})();


(function() {
  const ctx = document.getElementById('distChart').getContext('2d');
  const buckets = [
    { label:'< 2:55', min:0,   max:175, color:'#fbbf24' },
    { label:'2:55–3:00', min:175, max:180, color:'#22c55e' },
    { label:'3:00–3:10', min:180, max:190, color:'#86efac' },
    { label:'3:10–3:20', min:190, max:200, color:'#3b82f6' },
    { label:'3:20–3:30', min:200, max:210, color:'#60a5fa' },
    { label:'3:30–3:45', min:210, max:225, color:'#a78bfa' },
    { label:'3:45–4:00', min:225, max:240, color:'#f97316' },
    { label:'4:00+',     min:240, max:999, color:'#ef4444' },
  ];
  const counts = buckets.map(b => App.races.filter(r=>r.minutes>=b.min && r.minutes<b.max).length);

  new Chart(ctx, {
    type:'bar',
    data:{
      labels: buckets.map(b=>b.label),
      datasets:[{ data:counts,
        backgroundColor: buckets.map(b=>b.color+'bb'),
        borderColor: buckets.map(b=>b.color),
        borderWidth:1.5, borderRadius:8 }]
    },
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} race${i.raw!==1?'s':''}` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#8b949e', font:{size:10}} },
        y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e', stepSize:1} }
      }
    }
  });
})();


window.activeCountryFilter = null;
(function() {
  const ctx = document.getElementById('countryChart').getContext('2d');
  const palette = ['#f97316','#fbbf24','#22c55e','#3b82f6','#a78bfa','#ec4899',
                   '#06b6d4','#84cc16','#f43f5e','#fb923c','#34d399','#60a5fa',
                   '#c084fc','#f472b6','#2dd4bf','#a3e635','#fcd34d','#6ee7b7','#93c5fd'];

  const chart = new Chart(ctx, {
    type:'bar',
    data:{
      labels: App.countryData.map(c=>c.name),
      datasets:[{ data:App.countryData.map(c=>c.count),
        backgroundColor: palette.map(c=>c+'cc'),
        borderColor: palette, borderWidth:1.5, borderRadius:6 }]
    },
    options:{
      indexAxis:'y',
      layout: { padding: { left: 6 } },
      ...chartOpts(),
      onClick(e, els){
        if(!els.length){ window.activeCountryFilter=null; }
        else {
          const code = App.countryData[els[0].index].code;
          window.activeCountryFilter = window.activeCountryFilter===code ? null : code;
        }
        renderTable();
        // highlight active
        const bg = palette.map((c,i)=>{
          const code = App.countryData[i].code;
          return (!window.activeCountryFilter || code===window.activeCountryFilter) ? c+'cc' : c+'33';
        });
        chart.data.datasets[0].backgroundColor = bg;
        chart.update();
      },
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} race${i.raw>1?'s':''}` }
        }
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e',stepSize:1} },
        y:{ grid:{display:false}, ticks:{color:'#e6edf3', font:{size:12}, padding: 32} }
      }
    },
    plugins: [createYAxisFlagBarPlugin('flags_racesByCountry', i => App.countryData[i].code)]
  });
})();


(function() {
  const ctx = document.getElementById('yearChart').getContext('2d');
  const yearCounts = {};
  App.races.forEach(r=>{ yearCounts[r.year]=(yearCounts[r.year]||0)+1; });
  const yrs = Object.keys(yearCounts).sort();
  const counts = yrs.map(y=>yearCounts[y]);
  const max = Math.max(...counts);

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:yrs,
      datasets:[{ data:counts,
        backgroundColor: counts.map(v=>`rgba(249,115,22,${0.3+v/max*0.7})`),
        borderColor:'#f97316', borderWidth:1.5, borderRadius:8 }]
    },
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} App.races` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#e6edf3'} },
        y:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e',stepSize:1} }
      }
    }
  });
})();


(function() {
  window.leafletMap = L.map('worldMap', { zoomControl:true, scrollWheelZoom:false }).setView([45, 15], 3);

  window.leafletDarkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; <a href="https://carto.com/">CARTO</a>', subdomains:'abcd', maxZoom:19
  });
  window.leafletLightLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution:'&copy; <a href="https://carto.com/">CARTO</a>', subdomains:'abcd', maxZoom:19
  });

  window.leafletDarkLayer.addTo(window.leafletMap);

  const maxCount = Math.max(...App.countryData.map(c=>c.count));

  App.countryData.forEach(c => {
    const r = 14 + (c.count/maxCount)*28;
    const alpha = 0.35 + (c.count/maxCount)*0.55;
    const circle = L.circleMarker([c.lat, c.lng], {
      radius: r,
      fillColor:'#f97316', color:'#fbbf24',
      weight: c.count===maxCount ? 3 : 1.5,
      opacity: 0.9, fillOpacity: alpha
    });

    const raceList = App.races.filter(r=>r.country===c.code);
    const best = Math.min(...raceList.map(r=>r.minutes));
    circle.bindPopup(`
      <div class="map-popup-title">${flagImgHtml(c.code, 22)}<span>${c.name}</span></div>
      <div class="map-popup-count">${c.count} race${c.count>1?'s':''}</div>
      <div style="margin-top:6px;font-size:0.85rem;color:#8b949e">Best: ${fmtTime(best)}</div>
    `);

    circle.on('mouseover', function(){ this.openPopup(); });
    circle.addTo(window.leafletMap);

    // Label
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className:'',
        html: `<div style="font-size:${c.count>=5?'1.1':'0.9'}rem;font-weight:800;color:#fff;text-shadow:0 0 6px rgba(0,0,0,0.8);white-space:nowrap;pointer-events:none;">${c.count}</div>`,
        iconAnchor:[8,8]
      })
    }).addTo(window.leafletMap);
  });
})();


(function() {
  const ctx = document.getElementById('bestYearChart').getContext('2d');
  const yearBest = {};
  App.races.forEach(r=>{ if(!yearBest[r.year]||r.minutes<yearBest[r.year]) yearBest[r.year]=r.minutes; });
  const yrs = Object.keys(yearBest).sort();
  const bests = yrs.map(y=>yearBest[y]);

  new Chart(ctx, {
    type:'bar',
    data:{
      labels:yrs,
      datasets:[{ data:bests,
        backgroundColor: bests.map(v=>timeColor(v)+'aa'),
        borderColor: bests.map(v=>timeColor(v)),
        borderWidth:1.5, borderRadius:8 }]
    },
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`Best: ${fmtTime(i.raw)}` }
        },
        annotation:{
          annotations:{
            target:{ type:'line', yMin:170, yMax:170,
              borderColor:'rgba(251,191,36,0.5)', borderWidth:1.5, borderDash:[5,5],
              label:{ content:'2:50', display:true, position:'end',
                backgroundColor:'transparent', color:'#fbbf24', font:{size:10} } }
          }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#e6edf3'} },
        y: yTimeScale(160,270)
      }
    }
  });
})();


(function() {
  const majors  = App.races.filter(r=>r.major);
  const regular = App.races.filter(r=>!r.major);
  const avg  = arr => Math.round(arr.reduce((s,r)=>s+r.minutes,0)/arr.length);
  const best = arr => Math.min(...arr.map(r=>r.minutes));
  const worst= arr => Math.max(...arr.map(r=>r.minutes));

  const mAvg=avg(majors), rAvg=avg(regular);
  const mBest=best(majors), rBest=best(regular);
  const mWorst=worst(majors), rWorst=worst(regular);

  const grid = document.getElementById('compareGrid');
  grid.innerHTML = `
    <div class="compare-card">
      <h3 style="color:#fbbf24">⭐ World Majors (${majors.length})</h3>
      <div class="compare-row"><span class="compare-label">Average</span><span class="compare-val">${fmtTime(mAvg)}</span></div>
      <div class="compare-row"><span class="compare-label">Best</span><span class="compare-val" style="color:#22c55e">${fmtTime(mBest)}</span></div>
      <div class="compare-row"><span class="compare-label">Hardest</span><span class="compare-val" style="color:#ef4444">${fmtTime(mWorst)}</span></div>
    </div>
    <div class="compare-card">
      <h3 style="color:#3b82f6">🏃 Regular (${regular.length})</h3>
      <div class="compare-row"><span class="compare-label">Average</span><span class="compare-val">${fmtTime(rAvg)}</span></div>
      <div class="compare-row"><span class="compare-label">Best</span><span class="compare-val" style="color:#22c55e">${fmtTime(rBest)}</span></div>
      <div class="compare-row"><span class="compare-label">Hardest</span><span class="compare-val" style="color:#ef4444">${fmtTime(rWorst)}</span></div>
    </div>`;

  // Stacked comparison mini-chart
  const ctx = document.getElementById('compareChart').getContext('2d');
  new Chart(ctx, {
    type:'bar',
    data:{
      labels:['Avg','Best','Hardest'],
      datasets:[
        { label:'Majors', data:[mAvg,mBest,mWorst], backgroundColor:'rgba(251,191,36,0.7)', borderColor:'#fbbf24', borderWidth:1.5, borderRadius:6 },
        { label:'Regular',data:[rAvg,rBest,rWorst], backgroundColor:'rgba(59,130,246,0.7)', borderColor:'#3b82f6', borderWidth:1.5, borderRadius:6 }
      ]
    },
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:true, labels:{color:'#8b949e',boxWidth:12,font:{size:11}}},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.dataset.label}: ${fmtTime(i.raw)}` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#8b949e'} },
        y: yTimeScale(160,240)
      }
    }
  });
})();


(function() {
  const grid = document.getElementById('passportGrid');
  App.countryData.sort((a,b)=>b.count-a.count).forEach(c=>{
    const el = document.createElement('div');
    el.className = 'passport-item';
    el.title = `${c.name}: ${c.count} race${c.count>1?'s':''}`;
    el.innerHTML = `<div class="passport-flag">${flagImgHtml(c.code, 40)}</div><div class="passport-name">${c.name}</div><div class="passport-count">${c.count}</div>`;
    el.onclick = () => {
      window.activeCountryFilter = window.activeCountryFilter===c.code ? null : c.code;
      renderTable();
    };
    grid.appendChild(el);
  });
})();


(function() {
  const years = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
  const countries = [...App.countryData].sort((a,b)=>b.count-a.count);
  const matrix = {};
  App.races.forEach(r=>{ const k=`${r.year}-${r.country}`; matrix[k]=(matrix[k]||0)+1; });
  const maxVal = Math.max(...Object.values(matrix));

  let html = '<table class="heatmap-table"><thead><tr><th class="year-head">Year</th>';
  countries.forEach(c=>{ html+=`<th title="${c.name}" style="text-align:center;padding:6px 4px;vertical-align:middle">${flagImgHtml(c.code, 22)}</th>`; });
  html+='</tr></thead><tbody>';

  years.forEach(y=>{
    html+=`<tr><td class="year-label">${y}</td>`;
    countries.forEach(c=>{
      const v = matrix[`${y}-${c.code}`]||0;
      const alpha = v===0?0:0.18+(v/maxVal)*0.75;
      const cls = v===0?'heat-cell empty':'heat-cell';
      const style = v>0?`background:rgba(249,115,22,${alpha.toFixed(2)});cursor:pointer`:'';
      const click = v>0?`onclick="openHeatmapModal(${y},'${c.code}')"`:'' ;
      html+=`<td class="${cls}" style="${style}" title="${c.name} ${y}: ${v||'no'} race${v!==1?'s':''}" ${click}>${v||''}</td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('heatmapContainer').innerHTML = html;
})();


(function() {
  const top10 = [...App.races].sort((a,b)=>a.minutes-b.minutes).slice(0,10);
  const container = document.getElementById('topTimes');
  top10.forEach((r,i)=>{
    const rankClass = i===0?'r1':i===1?'r2':i===2?'r3':'rN';
    const el = document.createElement('div');
    el.className = 'podium-item';
    el.onclick = ()=>openModal(r);
    el.innerHTML = `
      <div class="podium-rank ${rankClass}">${i+1}</div>
      <div class="podium-name">${r.name}${r.major?` <span class="major-badge">⭐ Major</span>`:''}</div>
      <div class="podium-year">${r.year}</div>
      <div class="podium-time" style="color:${timeColor(r.minutes)}">${r.time}</div>`;
    container.appendChild(el);
  });
})();


(function() {
  const ctx = document.getElementById('avgYearChart').getContext('2d');
  const groups = {};
  App.races.forEach(r=>{ if(!groups[r.year]) groups[r.year]=[]; groups[r.year].push(r.minutes); });
  const yrs = Object.keys(groups).sort();
  const avgs = yrs.map(y=>Math.round(groups[y].reduce((a,b)=>a+b,0)/groups[y].length));

  new Chart(ctx, {
    type:'line',
    data:{ labels:yrs, datasets:[{
      data:avgs, borderColor:'#a78bfa', backgroundColor:'rgba(167,139,250,0.08)',
      borderWidth:2.5, pointBackgroundColor:avgs.map(v=>timeColor(v)),
      pointRadius:6, pointHoverRadius:9, tension:0.4, fill:true
    }]},
    options:{
      ...chartOpts(),
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`Avg: ${fmtTime(i.raw)}` }
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{color:'#e6edf3'} },
        y: yTimeScale(160,270)
      }
    }
  });
})();


let sortCol='idx', sortDir=1, activeFilter='all', searchQuery='';

function renderTable(){
  let list = App.races.filter(r=>{
    if(activeFilter==='major') return r.major;
    if(activeFilter==='sub3')  return r.minutes<180;
    if(!isNaN(activeFilter))   return r.year===parseInt(activeFilter);
    return true;
  });
  if(window.activeCountryFilter) list = list.filter(r=>r.country===window.activeCountryFilter);
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    list = list.filter(r=>r.name.toLowerCase().includes(q)||(App.countryMap[r.country]?.name||'').toLowerCase().includes(q));
  }
  list.sort((a,b)=>{
    let av=a[sortCol], bv=b[sortCol];
    if(typeof av==='string'){ av=av.toLowerCase(); bv=bv.toLowerCase(); }
    return av<bv?-sortDir:av>bv?sortDir:0;
  });

  const tbody = document.getElementById('racesBody');
  tbody.innerHTML='';
  list.forEach((r,i)=>{
    const c = App.countryMap[r.country]||{name:r.country};
    const tc = r.minutes<180?'sub3':r.minutes<195?'fast':r.minutes>=240?'tough':'';
    const tr = document.createElement('tr');
    tr.onclick = ()=>openModal(r);
    tr.innerHTML=`
      <td style="color:var(--muted)">${i+1}</td>
      <td><span class="cell-flag-label">${flagImgHtml(r.country, 18)}<span>${r.name}${r.major?` <span class="major-badge">⭐</span>`:''}</span></span></td>
      <td>${r.year}</td>
      <td><span class="cell-flag-label">${flagImgHtml(r.country, 22)}<span>${c.name}</span></span></td>
      <td class="time-cell ${tc}">${r.time}</td>
      <td style="color:var(--muted);font-size:0.8rem">#${r.rank} fastest</td>`;
    tbody.appendChild(tr);
  });
}

document.querySelectorAll('th[data-col]').forEach(th=>{
  th.addEventListener('click',()=>{
    const col=th.dataset.col;
    sortDir = sortCol===col ? sortDir*-1 : 1;
    sortCol=col; renderTable();
  });
});
document.querySelectorAll('.filter-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter=btn.dataset.filter; renderTable();
  });
});
document.getElementById('searchInput').addEventListener('input',e=>{ searchQuery=e.target.value; renderTable(); });

renderTable();

  // ── Latitude charts ───────────────────────────────────
  {
  const races = App.races;
  const continentMap = {
    TUR:'Asia', JAP:'Asia', USA:'North America',
    GER:'Europe', NOR:'Europe', NED:'Europe', DEN:'Europe', UK:'Europe',
    SER:'Europe', FRA:'Europe', GRE:'Europe', SWISS:'Europe', SPA:'Europe',
    SWE:'Europe', CZE:'Europe', ITA:'Europe', POL:'Europe', ICE:'Europe', MLA:'Europe', BEL:'Europe',
  };
  const contColor = { Europe:'#3b82f6', Asia:'#f97316', 'North America':'#22c55e' };
  const ptColor = r => contColor[continentMap[r.country]] || '#8b949e';

  // Latitude bands for annotation
  const bands = [
    { y: 78.2, label: '↑ Spitsbergen',  color: 'rgba(168,85,247,0.5)' },
    { y: 66.5, label: 'Arctic Circle',   color: 'rgba(99,102,241,0.4)' },
    { y: 55.0, label: 'Northern Europe', color: 'rgba(59,130,246,0.2)' },
    { y: 45.0, label: 'Central Europe',  color: 'rgba(34,197,94,0.15)' },
    { y: 35.0, label: 'Mediterranean',   color: 'rgba(249,115,22,0.15)' },
  ];

  // ── Chart 1: latitude over time ──────────────────────
  const ctx1 = document.getElementById('latTimeChart').getContext('2d');
  new Chart(ctx1, {
    type: 'scatter',
    data: { datasets: [{
      data: App.races.map((r,i) => ({ x: i+1, y: r.lat })),
      backgroundColor: App.races.map(r => ptColor(r) + 'cc'),
      borderColor:     App.races.map(r => ptColor(r)),
      pointRadius:     App.races.map(r => r.major ? 8 : 5),
      pointStyle:      App.races.map(r => r.major ? 'star' : 'circle'),
      pointHoverRadius: 9,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick(e, els){ if(els.length) openModal(App.races[els[0].index]); },
      interaction: { mode:'nearest', intersect:true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks: {
            title: items => {
              const r = App.races[items[0].dataIndex];
              return `${r.name} ${r.year}`;
            },
            label: item => [
              ` ${item.raw.y.toFixed(1)}°N`,
              ` Finish: ${App.races[item.dataIndex].time}`,
            ]
          }
        },
        annotation: { annotations: {
          arctic: { type:'line', yMin:66.5, yMax:66.5, borderColor:'rgba(99,102,241,0.5)', borderWidth:1, borderDash:[4,4],
            label:{ content:'Arctic Circle 66.5°N', display:true, position:'start', backgroundColor:'transparent', color:'#818cf8', font:{size:10} }},
          med:    { type:'line', yMin:45.0, yMax:45.0, borderColor:'rgba(34,197,94,0.3)',  borderWidth:1, borderDash:[4,4],
            label:{ content:'45°N', display:true, position:'start', backgroundColor:'transparent', color:'#86efac', font:{size:10} }},
        }}
      },
      scales: {
        x: { title:{ display:true, text:'Race #', color:'#8b949e', font:{size:11} },
             grid:{ color:'rgba(255,255,255,0.04)' }, ticks:{ color:'#8b949e' }, min:0, max:64 },
        y: { title:{ display:true, text:'Latitude °N', color:'#8b949e', font:{size:11} },
             grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#8b949e', callback: v=>`${v}°N` },
             min:30, max:82 }
      }
    }
  });

  // ── Chart 2: latitude vs finish time ─────────────────
  const ctx2 = document.getElementById('latTimeChart2').getContext('2d');
  new Chart(ctx2, {
    type: 'scatter',
    data: { datasets: [{
      data: App.races.map(r => ({ x: r.minutes, y: r.lat })),
      backgroundColor: App.races.map(r => ptColor(r) + 'cc'),
      borderColor:     App.races.map(r => ptColor(r)),
      pointRadius:     App.races.map(r => r.major ? 8 : 5),
      pointStyle:      App.races.map(r => r.major ? 'star' : 'circle'),
      pointHoverRadius: 9,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick(e, els){ if(els.length) openModal(App.races[els[0].index]); },
      interaction: { mode:'nearest', intersect:true },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks: {
            title: items => {
              const r = App.races[items[0].dataIndex];
              return `${r.name} ${r.year}`;
            },
            label: item => [
              ` ${item.raw.y.toFixed(1)}°N`,
              ` Finish: ${App.races[item.dataIndex].time}`,
            ]
          }
        },
        annotation: { annotations: {
          arctic: { type:'line', yMin:66.5, yMax:66.5, borderColor:'rgba(99,102,241,0.5)', borderWidth:1, borderDash:[4,4],
            label:{ content:'Arctic Circle', display:true, position:'end', backgroundColor:'transparent', color:'#818cf8', font:{size:10} }},
          sub3:   { type:'line', xMin:180, xMax:180, borderColor:'rgba(34,197,94,0.4)', borderWidth:1, borderDash:[4,4],
            label:{ content:'3:00', display:true, position:'start', backgroundColor:'transparent', color:'#86efac', font:{size:10} }},
        }}
      },
      scales: {
        x: { title:{ display:true, text:'Finish Time', color:'#8b949e', font:{size:11} },
             grid:{ color:'rgba(255,255,255,0.04)' },
             ticks:{ color:'#8b949e', callback: v => fmtTime(v) }, min:155, max:270 },
        y: { title:{ display:true, text:'Latitude °N', color:'#8b949e', font:{size:11} },
             grid:{ color:'rgba(255,255,255,0.05)' }, ticks:{ color:'#8b949e', callback: v=>`${v}°N` },
             min:30, max:82 }
      }
    }
  });

  // Colour legend
  [ctx1, ctx2].forEach((_, ci) => {
    const id = ci === 0 ? 'latTimeChart' : 'latTimeChart2';
    const wrap = document.getElementById(id)?.parentElement;
    if (!wrap) return;
    const leg = document.createElement('div');
    leg.style.cssText = 'display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:0.78rem;color:var(--muted)';
    leg.innerHTML = Object.entries(contColor).map(([k,v]) =>
      `<span style="display:flex;align-items:center;gap:5px"><span style="width:9px;height:9px;border-radius:50%;background:${v};display:inline-block"></span>${k}</span>`
    ).join('') + `<span style="display:flex;align-items:center;gap:5px"><span style="font-size:0.9rem">⭐</span>World Major</span>`;
    wrap.insertBefore(leg, wrap.firstChild);
  });
  }

  // ── Longitude chart ───────────────────────────────────
  {
  const races = App.races;
  const cMap2={TUR:'Asia',JAP:'Asia',USA:'North America'};
  const cc2={Asia:'#f97316','North America':'#22c55e',Europe:'#3b82f6'};
  const ptc=r=>cc2[cMap2[r.country]||'Europe'];

  const ctx=document.getElementById('lngChart').getContext('2d');
  new Chart(ctx,{
    type:'scatter',
    data:{datasets:[{
      data:App.races.map((r,i)=>({x:i+1,y:r.lng})),
      backgroundColor:App.races.map(r=>ptc(r)+'cc'),borderColor:App.races.map(r=>ptc(r)),
      pointRadius:App.races.map(r=>r.major?8:5),pointStyle:App.races.map(r=>r.major?'star':'circle'),
      pointHoverRadius:9}]},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:'nearest',intersect:true},
      onClick(e,els){if(els.length) openModal(App.races[els[0].index]);},
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:'#1f2937',borderColor:'#374151',borderWidth:1,padding:12,
          callbacks:{title:items=>`${App.races[items[0].dataIndex].name} ${App.races[items[0].dataIndex].year}`,
            label:item=>[` ${item.raw.y>=0?item.raw.y+'°E':Math.abs(item.raw.y)+'°W'}`,` ${App.races[item.dataIndex].time}`]}},
        annotation:{annotations:{
          prime:{type:'line',yMin:0,yMax:0,borderColor:'rgba(255,255,255,0.2)',borderWidth:1,borderDash:[4,4],
            label:{content:'0° Prime Meridian',display:true,position:'start',backgroundColor:'transparent',color:'#8b949e',font:{size:10}}},
          chi:{type:'line',yMin:-87.6,yMax:-87.6,borderColor:'rgba(59,130,246,0.3)',borderWidth:1,borderDash:[4,4],
            label:{content:'Chicago',display:true,position:'end',backgroundColor:'transparent',color:'#60a5fa',font:{size:10}}},
          tok:{type:'line',yMin:139.7,yMax:139.7,borderColor:'rgba(249,115,22,0.35)',borderWidth:1,borderDash:[4,4],
            label:{content:'Tokyo',display:true,position:'end',backgroundColor:'transparent',color:'#fb923c',font:{size:10}}}}}},
      scales:{
        x:{title:{display:true,text:'Race #',color:'#8b949e',font:{size:11}},grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'#8b949e'},min:0,max:64},
        y:{title:{display:true,text:'Longitude',color:'#8b949e',font:{size:11}},grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{color:'#8b949e',callback:v=>v>=0?`${v}°E`:`${Math.abs(v)}°W`},min:-100,max:150}}}
  });
  }

(function(){
  const groups={};
  App.races.forEach(r=>{ if(!groups[r.year]) groups[r.year]=[]; groups[r.year].push(r.minutes); });
  const yrs=Object.keys(groups).sort();
  const sds=yrs.map(y=>{
    const a=groups[y], mean=a.reduce((s,v)=>s+v,0)/a.length;
    return parseFloat(Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length).toFixed(1));
  });
  const max=Math.max(...sds);

  const ctx=document.getElementById('consistencyChart').getContext('2d');
  new Chart(ctx,{
    type:'bar',
    data:{ labels:yrs,
      datasets:[{ data:sds,
        backgroundColor:sds.map(v=>{const t=v/max;return `rgba(${Math.round(34+215*t)},${Math.round(197-175*t)},${Math.round(94-94*t)},0.75)`;}),
        borderColor:sds.map(v=>{const t=v/max;return `rgb(${Math.round(34+215*t)},${Math.round(197-175*t)},${Math.round(94-94*t)})` ;}),
        borderWidth:1.5, borderRadius:7 }]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937',borderColor:'#374151',borderWidth:1,padding:12,
          callbacks:{ label:i=>{const n=groups[yrs[i.dataIndex]].length;
            return[` Std dev: ±${i.raw} min`,` across ${n} race${n>1?'s':''}`];}}}},
      scales:{ x:{grid:{display:false},ticks:{color:'#e6edf3'}},
        y:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8b949e',callback:v=>`±${v}m`},min:0}}}
  });
})();



(function(){
  const majors=App.races.filter(r=>r.major).sort((a,b)=>a.idx-b.idx);
  let html=`<div style="display:flex;align-items:center;padding:24px 8px;overflow-x:auto">`;
  majors.forEach((r,i)=>{
    html+=`<div style="display:flex;flex-direction:column;align-items:center;gap:8px;min-width:110px;cursor:pointer"
      onclick="openModal(App.races[${r.idx-1}])">
      <div style="display:flex;justify-content:center;align-items:center;min-height:44px">${flagImgHtml(r.country, 40)}</div>
      <div style="width:44px;height:44px;border-radius:50%;
        background:linear-gradient(135deg,#fbbf24,#f97316);
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:1rem;color:#000;
        box-shadow:0 0 0 4px rgba(251,191,36,0.25);position:relative;z-index:1">${i+1}</div>
      <div style="text-align:center">
        <div style="font-weight:700;font-size:0.88rem">${r.name}</div>
        <div style="color:var(--muted);font-size:0.75rem">${r.year}</div>
        <div style="color:#22c55e;font-weight:800;font-size:0.9rem;margin-top:2px">${r.time}</div>
      </div></div>
    ${i<majors.length-1?`<div style="flex:1;height:2px;background:linear-gradient(90deg,#fbbf24,#f97316);min-width:20px;margin-bottom:52px;opacity:0.45"></div>`:''}`;
  });
  html+=`</div><div style="text-align:center;padding-top:14px;border-top:1px solid var(--border);
    color:var(--muted);font-size:0.8rem">
    All 6 Abbott World Marathon Majors completed &nbsp;·&nbsp;
    Best major: London 2024 (2:53) &nbsp;·&nbsp; Slowest: New York 2019 (3:42)</div>`;
  document.getElementById('majorsTimeline').innerHTML=html;
})();

(function(){
  const HOME_LAT = 39.9333;
  const seen=new Set(), cities=[];
  App.races.forEach(r=>{
    if(!seen.has(r.name)){ seen.add(r.name);
      const diff = parseFloat((r.lat - HOME_LAT).toFixed(2));
      cities.push({name:r.name, diff, lat:r.lat, country:r.country}); }
  });
  cities.sort((a,b) => b.diff - a.diff);

  const ctx=document.getElementById('distanceChart').getContext('2d');
  new Chart(ctx,{
    type:'bar',
    data:{labels:cities.map(c=>c.name),
      datasets:[{data:cities.map(c=>c.diff),
        backgroundColor:cities.map(c=>c.diff>=0?'#3b82f699':'#f9731699'),
        borderColor:cities.map(c=>c.diff>=0?'#3b82f6':'#f97316'),
        borderWidth:1.5,borderRadius:4}]},
    options:{
      indexAxis:'y',
      layout: { padding: { left: 6 } },
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{display:false},
        tooltip:{backgroundColor:'#1f2937',borderColor:'#374151',borderWidth:1,padding:12,
          callbacks:{label:i=>{
            const c=cities[i.dataIndex];
            const dir=c.diff>=0?'N of home':'S of home';
            return[` ${c.lat}°N  (${c.diff>=0?'+':''}${c.diff}°)`,` ${dir}`];
          }}}},
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#8b949e',callback:v=>`${v>=0?'+':''}${v}°`},
          title:{display:true,text:'Latitude difference from Ankara (39.93°N)',color:'#8b949e',font:{size:11}}},
        y:{grid:{display:false},ticks:{color:'#e6edf3',font:{size:10},padding:38}}
      }
    },
    plugins: [createYAxisFlagBarPlugin('flags_latDistanceHome', i => cities[i].country)]
  });
})();








(function() {
  const continentMap = {
    TUR:'Asia', JAP:'Asia',
    USA:'North America',
    GER:'Europe', NOR:'Europe', NED:'Europe', DEN:'Europe', UK:'Europe',
    SER:'Europe', FRA:'Europe', GRE:'Europe', SWISS:'Europe', SPA:'Europe',
    SWE:'Europe', CZE:'Europe', ITA:'Europe', POL:'Europe', ICE:'Europe', MLA:'Europe', BEL:'Europe',
  };

  const totals = {};
  App.races.forEach(r => {
    const c = continentMap[r.country] || 'Other';
    totals[c] = (totals[c] || 0) + 1;
  });

  const order  = ['Europe','Asia','North America'];
  const labels = order.filter(c => totals[c]);
  const data   = labels.map(c => totals[c]);
  const colors = { Europe:'#3b82f6', Asia:'#f97316', 'North America':'#22c55e' };
  const bgColors  = labels.map(c => colors[c] + 'cc');
  const brdColors = labels.map(c => colors[c]);

  const ctx = document.getElementById('continentChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderColor: brdColors, borderWidth: 2, hoverOffset: 10 }] },
    options: {
      responsive: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1f2937', borderColor: '#374151', borderWidth: 1, padding: 12,
          callbacks: {
            label: i => ` ${i.raw} App.races  (${((i.raw/App.races.length)*100).toFixed(1)}%)`
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      beforeDraw(chart) {
        const { ctx, chartArea: { top, bottom, left, right } } = chart;
        ctx.save();
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e6edf3'; ctx.font = 'bold 28px system-ui';
        ctx.fillText(String(App.races.length), cx, cy - 10);
        ctx.fillStyle = '#8b949e'; ctx.font = '12px system-ui';
        ctx.fillText('marathons', cx, cy + 14);
        ctx.restore();
      }
    }]
  });

  // Legend
  const legend = document.getElementById('continentLegend');
  const countryBreakdown = {};
  App.races.forEach(r => {
    const cont = continentMap[r.country] || 'Other';
    if (!countryBreakdown[cont]) countryBreakdown[cont] = {};
    countryBreakdown[cont][r.country] = (countryBreakdown[cont][r.country] || 0) + 1;
  });

  labels.forEach(cont => {
    const pct = ((totals[cont] / App.races.length) * 100).toFixed(1);
    const countries = Object.entries(countryBreakdown[cont])
      .sort((a,b) => b[1]-a[1])
      .map(([code, n]) => `${flagImgHtml(code, 16)} ${n}`)
      .join('  ');
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;flex-direction:column;gap:5px';
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:12px;height:12px;border-radius:3px;background:${colors[cont]};flex-shrink:0"></div>
        <span style="font-weight:700;font-size:1rem">${cont}</span>
        <span style="font-size:1.3rem;font-weight:800;color:${colors[cont]}">${totals[cont]}</span>
        <span style="color:var(--muted);font-size:0.8rem">${pct}%</span>
      </div>
      <div style="padding-left:22px;font-size:0.82rem;color:var(--muted);line-height:1.8">${countries}</div>`;
    legend.appendChild(div);
  });
})();

};