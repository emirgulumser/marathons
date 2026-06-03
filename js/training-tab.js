window.initTrainingTab = function () {
  if (window._trainingTabInit) return;
  window._trainingTabInit = true;
  const logKm = App.logKm;
  const logKm2 = App.logKm;
  const races = App.races;
const log = App.log;

  

  const totalKm   = App.log.reduce((s,d) => s+d.km, 0);
  const totalRuns = App.log.reduce((s,d) => s+d.runs, 0);
  const totalHrs  = App.log.reduce((s,d) => s+d.hours, 0);
  const peakYear  = App.log.reduce((a,b) => b.km>a.km?b:a);

  document.getElementById('trainStats').innerHTML = `
    <div class="stat-card c-orange"><div class="stat-icon">📏</div><div class="stat-value">${totalKm.toLocaleString()}</div><div class="stat-label">Total Kilometres</div></div>
    <div class="stat-card c-blue"><div class="stat-icon">👟</div><div class="stat-value">${totalRuns.toLocaleString()}</div><div class="stat-label">Total Runs</div></div>
    <div class="stat-card c-purple"><div class="stat-icon">⏱️</div><div class="stat-value">${Math.round(totalHrs).toLocaleString()}h</div><div class="stat-label">Total Moving Time</div></div>
    <div class="stat-card c-gold"><div class="stat-icon">🏆</div><div class="stat-value">${peakYear.year}</div><div class="stat-label">Peak Year (${peakYear.km.toLocaleString()} km)</div></div>
  `;

  const years  = App.log.map(d => d.year);
  const kms    = App.log.map(d => d.km);
  const runs   = App.log.map(d => d.runs);
  const avgKms = App.log.map(d => d.avgKm);

  // ── Chart 1: km bars + runs line (dual axis) ──────────
  const ctx1 = document.getElementById('trainKmChart').getContext('2d');
  new Chart(ctx1, {
    data: {
      labels: years,
      datasets: [
        { type:'bar', label:'Kilometres', data: kms, yAxisID:'yKm',
          backgroundColor: kms.map(k => `rgba(249,115,22,${0.4 + (k/4500)*0.55})`),
          borderColor:'#f97316', borderWidth:1.5, borderRadius:7, order:2 },
        { type:'line', label:'Runs', data: runs, yAxisID:'yRuns',
          borderColor:'#a78bfa', backgroundColor:'transparent',
          borderWidth:2.5, pointBackgroundColor:'#a78bfa',
          pointRadius:5, pointHoverRadius:8, tension:0.4, order:1 },
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, labels:{ color:'#8b949e', boxWidth:12, font:{size:11} } },
        tooltip: { backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks: { label: i => i.datasetIndex===0
            ? ` ${i.raw.toLocaleString()} km`
            : ` ${i.raw} runs` }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#e6edf3'} },
        yKm: { position:'left', grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{color:'#f97316', callback: v=>`${(v/1000).toFixed(1)}k`} },
        yRuns: { position:'right', grid:{display:false},
          ticks:{color:'#a78bfa'}, min:0, max:420 }
      }
    }
  });

  // ── Chart 2: avg km per run ───────────────────────────
  const ctx2 = document.getElementById('trainAvgChart').getContext('2d');
  new Chart(ctx2, {
    type:'bar',
    data: {
      labels: years,
      datasets: [{ data: avgKms,
        backgroundColor: avgKms.map(v => `rgba(20,184,166,${0.35+(v/16)*0.6})`),
        borderColor:'#14b8a6', borderWidth:1.5, borderRadius:7 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{display:false},
        tooltip: { backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks: { label: i=>`Avg ${i.raw} km per run` }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#e6edf3'} },
        y: { grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{color:'#8b949e', callback: v=>`${v} km`}, min:0 }
      }
    }
  });

  // ── Chart 3: cumulative km ────────────────────────────
  const ctx3 = document.getElementById('trainCumChart').getContext('2d');
  let cum = 0;
  const cumData = App.log.map(d => { cum += d.km; return cum; });

  new Chart(ctx3, {
    type:'line',
    data: {
      labels: years,
      datasets: [{ data: cumData,
        borderColor:'#fbbf24', borderWidth:3,
        backgroundColor: 'rgba(251,191,36,0.08)',
        pointBackgroundColor: '#fbbf24', pointRadius:6, pointHoverRadius:9,
        tension:0.4, fill:true }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend:{display:false},
        tooltip: { backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks: {
            label: i => ` ${i.raw.toLocaleString()} km cumulative`,
            afterLabel: i => ` +${App.log[i.dataIndex].km.toLocaleString()} km in ${years[i.dataIndex]}`
          }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#e6edf3'} },
        y: { grid:{color:'rgba(255,255,255,0.05)'},
          ticks:{ color:'#8b949e', callback: v=>`${(v/1000).toFixed(0)}k km` } }
      }
    }
  });

  (function(){
  const yearBest={};
  races.forEach(r=>{if(!yearBest[r.year]||r.minutes<yearBest[r.year]) yearBest[r.year]=r.minutes;});
  const yrs=Object.keys(logKm).sort();

  new Chart(document.getElementById('volPerfChart').getContext('2d'),{
    data:{labels:yrs,datasets:[
      {type:'bar',label:'Annual km',data:yrs.map(y=>logKm[y]),yAxisID:'yKm',
        backgroundColor:'rgba(249,115,22,0.45)',borderColor:'#f97316',borderWidth:1.5,borderRadius:6,order:2},
      {type:'line',label:'Best marathon',data:yrs.map(y=>yearBest[y]||null),yAxisID:'yTime',
        borderColor:'#22c55e',backgroundColor:'transparent',borderWidth:2.5,
        pointBackgroundColor:yrs.map(y=>timeColor(yearBest[y]||200)),
        pointRadius:6,pointHoverRadius:9,tension:0.4,order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:'#8b949e',boxWidth:12,font:{size:11}}},
        tooltip:{backgroundColor:'#1f2937',borderColor:'#374151',borderWidth:1,padding:12,
          callbacks:{label:i=>i.datasetIndex===0?` ${i.raw.toLocaleString()} km trained`:` Best: ${fmtTime(i.raw)}`}}},
      scales:{x:{grid:{display:false},ticks:{color:'#e6edf3'}},
        yKm:{position:'left',grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#f97316',callback:v=>`${(v/1000).toFixed(1)}k`}},
        yTime:{position:'right',grid:{display:false},ticks:{color:'#22c55e',callback:v=>fmtTime(v)},min:160,max:260,reverse:true}}}
  });
})();

(function(){
  const raceCounts={};
  races.forEach(r=>{raceCounts[r.year]=(raceCounts[r.year]||0)+1;});
  const yrs=Object.keys(logKm2).sort();

  new Chart(document.getElementById('racesKmChart').getContext('2d'),{
    data:{labels:yrs,datasets:[
      {type:'bar',label:'Marathons',data:yrs.map(y=>raceCounts[y]||0),yAxisID:'yRaces',
        backgroundColor:'rgba(167,139,250,0.55)',borderColor:'#a78bfa',borderWidth:1.5,borderRadius:6,order:2},
      {type:'line',label:'Annual km',data:yrs.map(y=>logKm2[y]),yAxisID:'yKm',
        borderColor:'#f97316',backgroundColor:'transparent',borderWidth:2.5,
        pointBackgroundColor:'#f97316',pointRadius:5,pointHoverRadius:8,tension:0.4,order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{color:'#8b949e',boxWidth:12,font:{size:11}}},
        tooltip:{backgroundColor:'#1f2937',borderColor:'#374151',borderWidth:1,padding:12,
          callbacks:{label:i=>i.datasetIndex===0?` ${i.raw} marathons`:` ${i.raw.toLocaleString()} km`}}},
      scales:{x:{grid:{display:false},ticks:{color:'#e6edf3'}},
        yRaces:{position:'left',grid:{color:'rgba(255,255,255,0.05)'},ticks:{color:'#a78bfa',stepSize:1}},
        yKm:{position:'right',grid:{display:false},ticks:{color:'#f97316',callback:v=>`${(v/1000).toFixed(1)}k`}}}}
  });
})();

};