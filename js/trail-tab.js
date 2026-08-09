window.initTrailTab = function () {
  if (window._trailTabInit) return;
  window._trailTabInit = true;
const trails = App.trails;

// Parse trail times (may be H:MM or HH:MM)
App.trails.forEach(t => {
  const parts = t.time.split(':').map(Number);
  t.minutes = parts[0]*60 + parts[1];
  t.pacePerKm = t.minutes / t.dist;          // min/km
  t.paceStr   = (() => {
    const total = Math.round(t.pacePerKm);
    return `${Math.floor(total/60)?Math.floor(total/60)+'h ':''}${total%60}'`;
  })();
});

const trailTotalKm  = App.trails.reduce((s,t)=>s+t.dist, 0);
const trailPodiums  = App.trails.filter(t=>t.podium).length;
const trailTotalMin = App.trails.reduce((s,t)=>s+t.minutes, 0);
const trailTotalH   = Math.floor(trailTotalMin/60);
const trailTotalM   = trailTotalMin%60;
const longestTrail  = App.trails.reduce((a,b)=>b.dist>a.dist?b:a);

// Trail stat cards
document.getElementById('trailStats').innerHTML = `
  <div class="stat-card c-green"><div class="stat-icon">⛰️</div><div class="stat-value">${App.trails.length}</div><div class="stat-label">Trail Races</div></div>
  <div class="stat-card c-teal"><div class="stat-icon">📏</div><div class="stat-value">${trailTotalKm}</div><div class="stat-label">Total Trail km</div></div>
  <div class="stat-card c-gold"><div class="stat-icon">🏆</div><div class="stat-value">${trailPodiums}</div><div class="stat-label">Podium Finishes</div></div>
  <div class="stat-card c-purple"><div class="stat-icon">🦁</div><div class="stat-value">${longestTrail.dist}K</div><div class="stat-label">Longest Race</div></div>
`;

// Trail Race Cards
const cardContainer = document.getElementById('trailCards');
[...App.trails].sort((a,b)=>a.year-b.year).forEach(t => {
  const div = document.createElement('div');
  div.className = `trail-card${t.podium?' podium':''}`;
  div.innerHTML = `
    ${t.podium?`<div class="podium-ribbon">🏆 ${escapeHtml(t.podium)}</div>`:''}
    <div class="trail-card-name">${escapeHtml(t.name)}</div>
    <div class="trail-card-meta">${escapeHtml(t.year)} · ${escapeHtml(t.dist)} km</div>
    <div class="trail-card-stats">
      <div class="trail-stat"><div class="trail-stat-label">Finish Time</div><div class="trail-stat-val" style="color:#22c55e">${escapeHtml(t.time)}</div></div>
      <div class="trail-stat"><div class="trail-stat-label">Avg Pace</div><div class="trail-stat-val">${Math.floor(t.pacePerKm)}'${Math.round((t.pacePerKm%1)*60).toString().padStart(2,'0')}" /km</div></div>
      <div class="trail-stat"><div class="trail-stat-label">Distance</div><div class="trail-stat-val">${escapeHtml(t.dist)} km</div></div>
    </div>`;
  cardContainer.appendChild(div);
});

// Trail chart: scatter — distance (x) vs finish time (y)
(function(){
  const ctx = document.getElementById('trailChart').getContext('2d');
  const colors = App.trails.map(t => t.podium?'#fbbf24':'#22c55e');
  new Chart(ctx, {
    type:'scatter',
    data:{ datasets:[{
      label:'Trail Race',
      data: App.trails.map(t=>({ x:t.dist, y:t.minutes, trail:t })),
      backgroundColor: colors.map(c=>c+'cc'),
      borderColor: colors,
      pointRadius: App.trails.map(t=>t.podium?10:7),
      pointStyle: App.trails.map(t=>t.podium?'star':'circle'),
      pointHoverRadius: 12,
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{
            title: items => App.trails[items[0].dataIndex].name,
            label: item => {
              const t = App.trails[item.dataIndex];
              return [` ${t.dist} km  ·  ${t.time}`,
                      ` Pace: ${Math.floor(t.pacePerKm)}'${Math.round((t.pacePerKm%1)*60).toString().padStart(2,'0')}" /km`,
                      t.podium ? ` 🏆 ${t.podium}` : ''].filter(Boolean);
            }
          }
        }
      },
      scales:{
        x:{ title:{ display:true, text:'Distance (km)', color:'#8b949e', font:{size:11} },
            grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e'}, min:0, max:130 },
        y:{ title:{ display:true, text:'Finish Time', color:'#8b949e', font:{size:11} },
            grid:{color:'rgba(255,255,255,0.05)'},
            ticks:{ color:'#8b949e', callback: v => {
              const h=Math.floor(v/60), m=v%60;
              return h>0?`${h}h${m>0?m+'m':''}`:`${m}m`;
            }},
            min:0 }
      }
    }
  });
})();

// Trail pace chart: horizontal bar sorted by pace
(function(){
  const ctx = document.getElementById('trailPaceChart').getContext('2d');
  const sorted = [...App.trails].sort((a,b)=>a.pacePerKm-b.pacePerKm);
  const labels = sorted.map(t=>`${t.name} ${t.dist}K`);
  const paces  = sorted.map(t=>parseFloat(t.pacePerKm.toFixed(2)));

  new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{
      data: paces,
      backgroundColor: sorted.map(t=>t.podium?'rgba(251,191,36,0.7)':'rgba(34,197,94,0.65)'),
      borderColor:     sorted.map(t=>t.podium?'#fbbf24':'#22c55e'),
      borderWidth:1.5, borderRadius:6,
    }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>{
            const t=sorted[i.dataIndex];
            const pm=i.raw, m=Math.floor(pm), s=Math.round((pm-m)*60);
            return ` ${m}'${s.toString().padStart(2,'0')}" per km`;
          }}
        }
      },
      scales:{
        x:{ grid:{color:'rgba(255,255,255,0.05)'},
            ticks:{ color:'#8b949e', callback: v=>{
              const m=Math.floor(v), s=Math.round((v-m)*60);
              return `${m}'${s.toString().padStart(2,'0')}"`;
            }}},
        y:{ grid:{display:false}, ticks:{color:'#e6edf3', font:{size:11}} }
      }
    }
  });
})();
};