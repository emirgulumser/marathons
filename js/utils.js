
const parseTime = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fmtTime   = m => {
  if (m == null || !Number.isFinite(m)) return '—';
  const rounded = Math.round(m);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
const timeColor = m => m<175?'#fbbf24': m<180?'#22c55e': m<195?'#86efac': m>=240?'#ef4444':'#3b82f6';

/** Escape text for safe insertion into HTML (text content / attributes). */
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ISO 3166-1 alpha-2 for flag images (emoji flags are unreliable on Windows). */
const COUNTRY_ISO2 = {
  TUR:'tr', GER:'de', NOR:'no', NED:'nl', DEN:'dk', USA:'us', UK:'gb', SER:'rs',
  FRA:'fr', GRE:'gr', JAP:'jp', SWISS:'ch', SPA:'es', SWE:'se', CZE:'cz', ITA:'it',
  POL:'pl', ICE:'is', MLA:'mt', BEL:'be'
};
function flagImgHtml(countryCode, w = 24) {
  const iso = COUNTRY_ISO2[countryCode];
  if (!iso) return '';
  const h = Math.max(12, Math.round(w * 3 / 4));
  /* flagcdn only serves select widths (w20, w40, …); arbitrary w22/w48 return 404. */
  const src = `https://flagcdn.com/w40/${iso}.png`;
  return `<img class="flag-img" src="${src}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async">`;
}

/** Flags for horizontal bar charts (indexAxis:'y') — canvas cannot use HTML flags in tick text. */
function createYAxisFlagBarPlugin(pluginId, getCountryCodeForIndex, opt = {}) {
  const flagW = opt.flagW ?? 20;
  const flagH = opt.flagH ?? 15;
  const gap = opt.gap ?? 8;
  const imgCache = new Map();

  function ensureImg(iso, chart) {
    if (!iso) return null;
    if (!imgCache.has(iso)) {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { try { chart.update('none'); } catch (_) {} };
      im.src = `https://flagcdn.com/w40/${iso}.png`;
      imgCache.set(iso, im);
    }
    return imgCache.get(iso);
  }

  return {
    id: pluginId,
    afterInit(chart) {
      const n = chart.data.labels.length;
      for (let i = 0; i < n; i++) {
        const iso = COUNTRY_ISO2[getCountryCodeForIndex(i)];
        if (iso) ensureImg(iso, chart);
      }
    },
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data.length) return;
      const { ctx } = chart;
      /* Room must exist between tick labels and bars (y.ticks.padding); draw in that strip. */
      const xFlag = chart.chartArea.left - flagW - gap;
      meta.data.forEach((bar, i) => {
        const iso = COUNTRY_ISO2[getCountryCodeForIndex(i)];
        if (!iso) return;
        const img = ensureImg(iso, chart);
        if (!img || !img.complete || !img.naturalWidth) return;
        const cy = bar.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(128,128,128,0.4)';
        ctx.lineWidth = 1;
        ctx.drawImage(img, xFlag, cy - flagH / 2, flagW, flagH);
        ctx.strokeRect(xFlag + 0.5, cy - flagH / 2 + 0.5, flagW - 1, flagH - 1);
        ctx.restore();
      });
    }
  };
}