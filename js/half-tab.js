window.initHalfTab = function () {
  if (window._halfTabInit) return;
  window._halfTabInit = true;
const halfRaces = App.halfRaces;
  halfRaces.forEach((r, i) => {
    r.idx = i + 1;
    r.minutes = parseTime(r.time);
    r.city = r.name;
  });
  let hpb = Infinity;
  halfRaces.forEach(r => {
    r.isPB = r.minutes < hpb;
    if (r.isPB) hpb = r.minutes;
  });
  const sortedHalf = [...halfRaces].sort((a, b) => a.minutes - b.minutes);
  halfRaces.forEach(r => { r.rank = sortedHalf.indexOf(r) + 1; });
  const halfData = [];
  halfRaces.forEach(r => {
    let g = halfData.find(d => d.city === r.name && d.country === r.country);
    if (!g) {
      g = { city: r.name, country: r.country, count: 0, lat: r.lat, lng: r.lng };
      halfData.push(g);
    }
    g.count++;
  });

  const ANKARA_LAT = 39.9333, ANKARA_LNG = 32.8597;
  function haversine(lat1,lng1,lat2,lng2){
    const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
  }

  const continentMap = { TUR:'Asia', NED:'Europe', BEL:'Europe', USA:'North America' };
  const contColors   = { Asia:'#f97316', Europe:'#3b82f6', 'North America':'#22c55e' };

  const totalRaces  = halfData.reduce((s,d) => s+d.count, 0);
  const totalCities = halfData.length;
  const totalKm     = Math.round(totalRaces * 21.0975);
  const countries   = [...new Set(halfData.map(d => d.country))].length;

  // ── Stats ─────────────────────────────────────────────
  
  const palette = ['#f97316','#fbbf24','#3b82f6','#22c55e','#a78bfa','#ec4899','#06b6d4','#10b981','#f43f5e'];
  const sorted  = [...halfData].sort((a,b) => b.count - a.count);

  // ── City bar chart ─────────────────────────────────────
  new Chart(document.getElementById('halfCityChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.city),
      datasets: [{ data: sorted.map(d => d.count),
        backgroundColor: palette.map(c => c+'bb'),
        borderColor: palette, borderWidth:1.5, borderRadius:8 }]
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} race${i.raw>1?'s':''}` }}},
      scales: {
        x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e',stepSize:1} },
        y:{ grid:{display:false}, ticks:{color:'#e6edf3', font:{size:13}} }
      }
    }
  });

  // ── Country doughnut ───────────────────────────────────
  const countryTotals = {};
  halfData.forEach(d => {
    countryTotals[d.country] = (countryTotals[d.country]||0) + d.count;
  });
  const cLabels = Object.keys(countryTotals);
  const cCounts = cLabels.map(c => countryTotals[c]);
  const cColors = ['#f97316','#3b82f6','#22c55e','#fbbf24'];

  new Chart(document.getElementById('halfCountryChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: cLabels.map(c => `${c} (${countryTotals[c]})`),
      datasets:[{ data:cCounts,
        backgroundColor: cColors.map(c=>c+'cc'),
        borderColor: cColors, borderWidth:2, hoverOffset:10 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'65%',
      plugins: {
        legend:{ display:true, position:'bottom', labels:{ color:'#8b949e', boxWidth:12, font:{size:12}, padding:14 }},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} race${i.raw>1?'s':''} (${((i.raw/totalRaces)*100).toFixed(0)}%)` }}
      }
    },
    plugins:[{
      id:'centerText',
      beforeDraw(chart){
        const {ctx,chartArea:{top,bottom,left,right}}=chart;
        ctx.save();
        const cx=(left+right)/2, cy=(top+bottom)/2;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle='#e6edf3'; ctx.font='bold 26px system-ui';
        ctx.fillText(totalRaces, cx, cy-10);
        ctx.fillStyle='#8b949e'; ctx.font='11px system-ui';
        ctx.fillText('half marathons', cx, cy+12);
        ctx.restore();
      }
    }]
  });

  // ── Leaflet map ────────────────────────────────────────
  const halfMap = L.map('halfMap', { zoomControl:true, scrollWheelZoom:false }).setView([35,15], 2);
  window.halfMapRef = halfMap;
  const darkTile = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const lightTile= 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
  window.halfTileLayer = L.tileLayer(document.documentElement.getAttribute('data-theme') === 'light' ? lightTile : darkTile, {
    attribution:'&copy; OpenStreetMap &copy; CARTO', subdomains:'abcd', maxZoom:19
  }).addTo(halfMap);

  halfData.forEach(d => {
    const r = 6 + d.count * 4;
    L.circleMarker([d.lat, d.lng], {
      radius: r, color:'#f97316', fillColor:'#f97316',
      fillOpacity:0.7, weight:2
    }).addTo(halfMap)
     .bindPopup(`<div style="display:flex;align-items:center;gap:8px"><span>${flagImgHtml(d.country, 22)}</span><b>${d.city}</b></div><br>${d.count} race${d.count>1?'s':''}`);
  });

    // ── Latitude bar chart ─────────────────────────────────
  const latSorted = [...halfData].sort((a,b) => b.lat - a.lat);
  new Chart(document.getElementById('halfLatChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: latSorted.map(d => d.city),
      datasets:[{ data: latSorted.map(d => d.lat),
        backgroundColor: latSorted.map(d => {
          if(d.lat > 45) return '#3b82f6bb';
          if(d.lat > 35) return '#22c55ebb';
          return '#f97316bb';
        }),
        borderColor: latSorted.map(d => {
          if(d.lat > 45) return '#3b82f6';
          if(d.lat > 35) return '#22c55e';
          return '#f97316';
        }),
        borderWidth:1.5, borderRadius:6 }]
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw.toFixed(2)}° N` }}},
      scales: {
        x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e'}, title:{display:true, text:'Latitude (°N)', color:'#8b949e'} },
        y:{ grid:{display:false}, ticks:{color:'#e6edf3', font:{size:12}} }
      }
    }
  });

  // ── Distance from Home bar chart ─────────────────────
  const distData = halfData.map(d => ({
    ...d, dist: haversine(ANKARA_LAT, ANKARA_LNG, d.lat, d.lng)
  })).sort((a,b) => b.dist - a.dist);

  new Chart(document.getElementById('halfDistChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: distData.map(d => d.city),
      datasets:[{ data: distData.map(d => d.dist),
        backgroundColor: distData.map(d => {
          if(d.dist > 8000) return '#a78bfabb';
          if(d.dist > 1000) return '#3b82f6bb';
          return '#22c55ebb';
        }),
        borderColor: distData.map(d => {
          if(d.dist > 8000) return '#a78bfa';
          if(d.dist > 1000) return '#3b82f6';
          return '#22c55e';
        }),
        borderWidth:1.5, borderRadius:6 }]
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false},
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw.toLocaleString()} km from Home` }}},
      scales: {
        x:{ grid:{color:'rgba(255,255,255,0.05)'}, ticks:{color:'#8b949e'}, title:{display:true, text:'Distance (km)', color:'#8b949e'} },
        y:{ grid:{display:false}, ticks:{color:'#e6edf3', font:{size:12}} }
      }
    }
  });

  // ── Continent doughnut ─────────────────────────────────
  const contTotals = {};
  halfData.forEach(d => {
    const cont = continentMap[d.country] || 'Other';
    contTotals[cont] = (contTotals[cont]||0) + d.count;
  });
  const contLabels = Object.keys(contTotals);
  const contCounts = contLabels.map(c => contTotals[c]);
  const contColArr = contLabels.map(c => contColors[c] || '#8b949e');

  new Chart(document.getElementById('halfContChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: contLabels,
      datasets:[{ data: contCounts,
        backgroundColor: contColArr.map(c=>c+'cc'),
        borderColor: contColArr, borderWidth:2, hoverOffset:10 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:'60%',
      plugins: {
        legend:{ display:false },
        tooltip:{ backgroundColor:'#1f2937', borderColor:'#374151', borderWidth:1, padding:12,
          callbacks:{ label: i=>`${i.raw} race${i.raw>1?'s':''} (${((i.raw/totalRaces)*100).toFixed(0)}%)` }}
      }
    }
  });

  // continent legend
  const legEl = document.getElementById('halfContLegend');
  contLabels.forEach((c,i) => {
    const pct = ((contCounts[i]/totalRaces)*100).toFixed(0);
    legEl.innerHTML += `
      <div class="legend-item">
        <span class="legend-dot" style="background:${contColArr[i]}"></span>
        <div>
          <div class="legend-name">${c}</div>
          <div class="legend-pct">${contCounts[i]} races · ${pct}%</div>
        </div>
      </div>`;
  });

  // ── City passport cards ────────────────────────────────
  const grid = document.getElementById('halfPassport');
  sorted.forEach(d => {
    const el = document.createElement('div');
    el.className = 'passport-item';
    el.title = `${d.city}: ${d.count} race${d.count>1?'s':''}`;
    el.innerHTML = `
      <div class="passport-flag">${flagImgHtml(d.country, 40)}</div>
      <div class="passport-name">${escapeHtml(d.city)}</div>
      <div class="passport-count">${d.count}</div>`;
    grid.appendChild(el);
  });

  const halfCountryMap = {};
  App.countryData.forEach(c => { halfCountryMap[c.code] = c; });

  function renderHalfTable() {
    let list = [...halfRaces];
    const q = (document.getElementById('halfSearchInput')?.value || '').toLowerCase();
    if (q) {
      list = list.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (halfCountryMap[r.country]?.name || '').toLowerCase().includes(q)
      );
    }
    const col = window.halfSortCol || 'year';
    const dir = window.halfSortDir || -1;
    list.sort((a, b) => {
      let av = a[col], bv = b[col];
      if (typeof av === 'string') { av = av.toLowerCase(); bv = String(bv).toLowerCase(); }
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    const tbody = document.getElementById('halfRacesBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    list.forEach((r, i) => {
      const c = halfCountryMap[r.country] || { name: r.country };
      const tr = document.createElement('tr');
      tr.onclick = () => window.openHalfModal(r);
      tr.innerHTML = `
        <td style="color:var(--muted)">${i + 1}</td>
        <td><span class="cell-flag-label">${flagImgHtml(r.country, 18)}<span>${escapeHtml(r.name)}${r.isPB ? ' 🏆' : ''}</span></span></td>
        <td>${escapeHtml(r.year)}</td>
        <td><span class="cell-flag-label">${flagImgHtml(r.country, 22)}<span>${escapeHtml(c.name)}</span></span></td>
        <td class="time-cell ${r.minutes < 90 ? 'sub3' : r.minutes < 95 ? 'fast' : ''}">${escapeHtml(r.time)}</td>
        <td style="color:var(--muted);font-size:0.8rem">#${r.rank} fastest</td>`;
      tbody.appendChild(tr);
    });
  }

  window.openHalfModal = function(r) {
    const c = halfCountryMap[r.country] || { name: r.country };
    document.getElementById('modalContent').innerHTML = `
      <div class="modal-flag">${flagImgHtml(r.country, 48)}</div>
      <div class="modal-title">${escapeHtml(r.name)}</div>
      <div class="modal-subtitle">${escapeHtml(r.year)} · ${escapeHtml(c.name)} · Half Marathon</div>
      <div class="modal-time" style="color:#22c55e">${escapeHtml(r.time)}</div>
      ${r.isPB ? '<div style="color:#fbbf24;font-weight:700;margin-bottom:8px">🏆 Personal Best!</div>' : ''}
      <div class="modal-grid">
        <div class="modal-stat-box"><div class="modal-stat-label">Overall Rank</div><div class="modal-stat-val">#${r.rank} / ${halfRaces.length}</div></div>
        <div class="modal-stat-box"><div class="modal-stat-label">Pace / km</div><div class="modal-stat-val">${fmtTime(Math.round(r.minutes / 21.0975))}</div></div>
      </div>`;
    document.getElementById('modal').classList.add('open');
  };

  window.halfSortCol = 'year';
  window.halfSortDir = -1;
  document.querySelectorAll('#halfTable th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      window.halfSortDir = window.halfSortCol === col ? window.halfSortDir * -1 : 1;
      window.halfSortCol = col;
      renderHalfTable();
    });
  });
  document.getElementById('halfSearchInput')?.addEventListener('input', renderHalfTable);
  renderHalfTable();

  const halfPB = Math.min(...halfRaces.map(r => r.minutes));
  const halfSub130 = halfRaces.filter(r => r.minutes < 90).length;
  document.getElementById('halfStats').innerHTML = `
    <div class="stat-card c-blue"><div class="stat-icon">½</div><div class="stat-value">${totalRaces}</div><div class="stat-label">Half Marathons</div></div>
    <div class="stat-card c-gold"><div class="stat-icon">⚡</div><div class="stat-value">${fmtTime(halfPB)}</div><div class="stat-label">Personal Best</div></div>
    <div class="stat-card c-green"><div class="stat-icon">🟢</div><div class="stat-value">${halfSub130}</div><div class="stat-label">Sub-1:30</div></div>
    <div class="stat-card c-teal"><div class="stat-icon">📏</div><div class="stat-value">${totalKm}</div><div class="stat-label">Total km</div></div>`;

};