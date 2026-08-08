/** Race-day weather lookup and difficulty scoring. */
window.RaceWeather = {
  WEATHER_LABEL: {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Foggy', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow',
    80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm',
  },

  weatherLabel(code) {
    if (code == null) return 'Unknown';
    return this.WEATHER_LABEL[code] || 'Mixed';
  },

  /** Derive human-readable conditions from measurements (more reliable than a single hourly code). */
  deriveConditions({ rainMm = 0, snowCm = 0, weatherCode, codesInWindow = [] } = {}) {
    if (snowCm >= 1) return 'Snow';
    if (snowCm > 0) return 'Light snow';
    if (rainMm >= 8) return 'Heavy rain';
    if (rainMm >= 2) return 'Rain';
    if (rainMm >= 0.3) return 'Light rain';

    if (codesInWindow.length) {
      const counts = {};
      for (const c of codesInWindow) {
        if (c == null) continue;
        counts[c] = (counts[c] || 0) + 1;
      }
      const mode = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]);
      if (!Number.isNaN(mode)) return this.weatherLabel(mode);
    }
    return this.weatherLabel(weatherCode);
  },

  /** Resolve race name|year → date, elevation, and race-time window from linked Garmin activities. */
  resolveRaceDates(activities, races, overrides = []) {
    const linked = ActivityUtils.linkRaces(activities, races, overrides);
    const map = new Map();
    for (const act of linked) {
      if (!act.raceMatch) continue;
      const key = `${act.raceMatch.raceName}|${act.raceMatch.raceYear}`;
      if (!map.has(key)) {
        const race = races.find(r => r.name === act.raceMatch.raceName && r.year === act.raceMatch.raceYear);
        const officialSec = race?.time ? parseTime(race.time) * 60 : null;
        map.set(key, {
          date: act.date,
          elevGain: act.elevGain || 0,
          startTime: act.startTime ?? null,
          durationSec: act.durationSec || officialSec || 4 * 3600,
        });
      }
    }
    return map;
  },

  minutesFromTime(isoLocal) {
    return parseInt(isoLocal.slice(11, 13), 10) * 60 + parseInt(isoLocal.slice(14, 16), 10);
  },

  formatMinutes(totalMin) {
    const dayMin = ((totalMin % 1440) + 1440) % 1440;
    const h = Math.floor(dayMin / 60);
    const m = Math.round(dayMin % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  utcToLocalMinutes(epochMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(epochMs));
    const hour = +parts.find(p => p.type === 'hour').value;
    const minute = +parts.find(p => p.type === 'minute').value;
    return hour * 60 + minute;
  },

  /** Wave start bands by predicted finish time (minutes). Sources: official race websites. */
  WAVE_BANDS: {
    Boston: [
      { maxFinishMin: 185, start: '10:00' },
      { maxFinishMin: 210, start: '10:25' },
      { maxFinishMin: 235, start: '10:50' },
      { maxFinishMin: 999, start: '11:15' },
    ],
    Chicago: [
      { maxFinishMin: 195, start: '07:30' },
      { maxFinishMin: 225, start: '08:00' },
      { maxFinishMin: 999, start: '08:35' },
    ],
    'New York': [
      { maxFinishMin: 195, start: '09:10' },
      { maxFinishMin: 225, start: '09:45' },
      { maxFinishMin: 255, start: '10:20' },
      { maxFinishMin: 999, start: '10:55' },
    ],
    London: [
      { maxFinishMin: 185, start: '09:35' },
      { maxFinishMin: 210, start: '10:00' },
      { maxFinishMin: 235, start: '10:30' },
      { maxFinishMin: 999, start: '11:00' },
    ],
    Paris: [
      { maxFinishMin: 185, start: '08:03' },
      { maxFinishMin: 200, start: '08:22' },
      { maxFinishMin: 215, start: '08:44' },
      { maxFinishMin: 230, start: '09:34' },
      { maxFinishMin: 250, start: '10:19' },
      { maxFinishMin: 999, start: '11:10' },
    ],
    Berlin: [
      { maxFinishMin: 200, start: '09:15' },
      { maxFinishMin: 230, start: '09:45' },
      { maxFinishMin: 260, start: '10:10' },
      { maxFinishMin: 999, start: '10:40' },
    ],
    Stockholm: [
      { maxFinishMin: 200, start: '12:00' },
      { maxFinishMin: 225, start: '12:08' },
      { maxFinishMin: 999, start: '12:16' },
    ],
    Manchester: [
      { maxFinishMin: 185, start: '09:00' },
      { maxFinishMin: 190, start: '09:10' },
      { maxFinishMin: 200, start: '09:20' },
      { maxFinishMin: 210, start: '09:30' },
      { maxFinishMin: 220, start: '09:40' },
      { maxFinishMin: 230, start: '09:50' },
      { maxFinishMin: 240, start: '10:00' },
      { maxFinishMin: 999, start: '10:20' },
    ],
    Chitose: [
      { maxFinishMin: 210, start: '09:30' },
      { maxFinishMin: 225, start: '09:40' },
      { maxFinishMin: 240, start: '09:50' },
      { maxFinishMin: 999, start: '10:00' },
    ],
    Reykjavik: [
      { maxFinishMin: 210, start: '08:15' },
      { maxFinishMin: 999, start: '08:45' },
    ],
  },

  /** Apply course-reported weather corrections (e.g. on-route temps vs grid model). */
  applyWeatherOverrides(weather, raceName, year, overrides = {}) {
    const o = overrides[`${raceName}|${year}`];
    if (!o || !weather) return weather;
    const merged = { ...weather };
    for (const k of ['tempC', 'tempMin', 'tempMax', 'humidity', 'windKph', 'windMaxKph', 'rainMm', 'weatherCode', 'conditions']) {
      if (o[k] != null) merged[k] = o[k];
    }
    if (o.source) merged.weatherNote = o.source;
    if (o.rainMm != null) merged.precipMm = o.rainMm;
    return merged;
  },

  parseStartLocal(startStr) {
    const [h, m] = startStr.split(':').map(Number);
    return h * 60 + (m || 0);
  },

  /** Resolve local HH:MM start from Garmin, official lookup, or wave estimate. */
  resolveStartLocal(race, meta, startTimes = {}) {
    const key = `${race.name}|${race.year}`;
    const finishMin = race?.time ? parseTime(race.time) : null;
    const overrides = startTimes.overrides || {};
    const defaults = startTimes.defaults || {};

    if (overrides[key]?.start) {
      return { start: overrides[key].start, source: 'official', note: overrides[key].source };
    }

    const entry = defaults[race.name];

    if (entry?.wave && finishMin != null) {
      const bands = this.WAVE_BANDS[entry.wave];
      if (bands) {
        const band = bands.find(b => finishMin <= b.maxFinishMin);
        if (band) return { start: band.start, source: 'official', note: entry.source };
      }
    }
    if (entry?.start) {
      return { start: entry.start, source: 'official', note: entry.source };
    }
    return { start: '09:00', source: 'estimated', note: 'Default mass-start assumption' };
  },

  /** Start/end in local minutes-from-midnight for the race effort window. */
  raceWindowMinutes(meta, timeZone, race, startTimes) {
    const durationSec = meta.durationSec ?? 4 * 3600;
    let startMin = 9 * 60;
    let source = 'estimated';
    let note = '';

    if (meta.startTime && timeZone) {
      startMin = this.utcToLocalMinutes(meta.startTime, timeZone);
      source = 'garmin';
      note = 'Garmin activity start';
    } else if (race) {
      const resolved = this.resolveStartLocal(race, meta, startTimes);
      startMin = this.parseStartLocal(resolved.start);
      source = resolved.source;
      note = resolved.note || '';
    }

    const endMin = startMin + durationSec / 60;
    return {
      startMin,
      endMin,
      source,
      note,
      windowStart: this.formatMinutes(startMin),
      windowEnd: this.formatMinutes(endMin),
    };
  },

  windowIndices(times, startMin, endMin) {
    return times
      .map((t, i) => {
        const hStart = this.minutesFromTime(t);
        return { i, hStart, hEnd: hStart + 60 };
      })
      .filter(x => x.hStart < endMin && x.hEnd > startMin)
      .map(x => x.i);
  },

  aggregateHourlyWindow(hourly, pick) {
    const vals = key => pick.map(i => hourly[key][i]).filter(v => v != null);
    const avg = key => {
      const v = vals(key);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    };
    const sum = key => pick.reduce((s, i) => s + (hourly[key][i] || 0), 0);
    const min = key => {
      const v = vals(key);
      return v.length ? Math.min(...v) : null;
    };
    const max = key => {
      const v = vals(key);
      return v.length ? Math.max(...v) : null;
    };
    const codesInWindow = pick.map(i => hourly.weathercode[i]).filter(c => c != null);
    const weatherCode = codesInWindow.length
      ? Number(Object.entries(
        codesInWindow.reduce((m, c) => { m[c] = (m[c] || 0) + 1; return m; }, {}),
      ).sort((a, b) => b[1] - a[1])[0][0])
      : null;

    return {
      tempC: avg('temperature_2m'),
      tempMin: min('temperature_2m'),
      tempMax: max('temperature_2m'),
      humidity: avg('relative_humidity_2m'),
      windKph: avg('windspeed_10m'),
      windMaxKph: max('windspeed_10m'),
      rainMm: sum('rain'),
      snowCm: sum('snowfall'),
      precipMm: sum('precipitation'),
      weatherCode,
      codesInWindow,
      hoursSampled: pick.length,
    };
  },

  /** Magnus dew point (°C) — combines temperature and relative humidity. */
  dewPoint(tempC, humidity) {
    if (tempC == null || humidity == null) return null;
    const a = 17.27;
    const b = 237.7;
    const rh = Math.min(100, Math.max(1, humidity));
    const alpha = (a * tempC) / (b + tempC) + Math.log(rh / 100);
    return (b * alpha) / (a - alpha);
  },

  /** Steadman-style heat index for warm/humid conditions (°C). */
  heatIndex(tempC, humidity) {
    if (tempC == null || humidity == null) return tempC;
    if (tempC < 20) return tempC;
    const h = humidity / 100;
    return tempC + h * (tempC - 14) * 0.55 + h * h * (tempC - 14) * 0.2;
  },

  /** Environment Canada wind chill (°C), wind in km/h. */
  windChill(tempC, windKph) {
    if (tempC == null || windKph == null || tempC > 10 || windKph <= 4.8) return tempC;
    return 13.12 + 0.6215 * tempC
      - 11.37 * Math.pow(windKph, 0.16)
      + 0.3965 * tempC * Math.pow(windKph, 0.16);
  },

  /** Stull (2011) wet-bulb temperature from air temp (°C) and RH (%). */
  wetBulb(tempC, humidity) {
    if (tempC == null || humidity == null) return tempC;
    const rh = Math.min(99, Math.max(5, humidity));
    const T = tempC;
    return T * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
      + Math.atan(T + rh)
      - Math.atan(rh - 1.676331)
      + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh)
      - 4.686035;
  },

  /** Approximate solar/globe offset (°C) from Open-Meteo WMO weather code. */
  solarOffset(weatherCode, conditions = '') {
    if (weatherCode == null) {
      if (/clear|sunny/i.test(conditions)) return 7;
      if (/partly|mainly/i.test(conditions)) return 3.5;
      return 1;
    }
    if (weatherCode === 0) return 7;
    if (weatherCode === 1) return 5;
    if (weatherCode === 2) return 3.5;
    if (weatherCode === 3) return 1;
    return 0.5; // fog / precip — low radiant load
  },

  /**
   * Estimated outdoor WBGT (°C): 0.7·Tw + 0.2·Tg + 0.1·Td
   * Used by ACSM / World Athletics and Ely et al. marathon studies.
   */
  estimateWbgt(tempC, humidity, weatherCode, conditions) {
    if (tempC == null) return null;
    const Tw = this.wetBulb(tempC, humidity ?? 50);
    const Tg = tempC + this.solarOffset(weatherCode, conditions);
    return 0.7 * Tw + 0.2 * Tg + 0.1 * tempC;
  },

  /**
   * Race difficulty from weather (+ optional course elevation). No upper cap.
   *
   * Anchored on estimated WBGT (Ely 2007 / ACSM heat strain) for heat,
   * plus independent cold, mechanical wind, and precipitation terms
   * (Boston Marathon 1972–2018 weather–performance study).
   */
  computeDifficulty(weather, elevGain = 0) {
    if (!weather) return null;

    const temp = weather.tempC ?? 15;
    const humidity = weather.humidity ?? 50;
    const wind = weather.windKph ?? 0;
    const windMax = weather.windMaxKph ?? wind;
    // Gusts matter for wind chill / Arctic exposure even when average wind looks calm
    const windEff = Math.max(wind, windMax * 0.7);
    const rainMm = weather.rainMm ?? weather.precipMm ?? 0;
    const snowCm = weather.snowCm ?? 0;
    const dew = this.dewPoint(temp, humidity);
    const hi = this.heatIndex(temp, humidity) ?? temp;
    const chill = this.windChill(temp, windEff);
    const wbgt = this.estimateWbgt(temp, humidity, weather.weatherCode, weather.conditions);

    // Heat — Ely power-law slowdown when WBGT > 10°C (optimal marathon band ~7.5–15°C)
    // penalty% ≈ 0.0975 × (WBGT − 10)^1.71; map ~1% → ~4.2 difficulty pts
    let thermal = 0;
    if (wbgt != null && wbgt > 10) {
      thermal += 0.0975 * Math.pow(wbgt - 10, 1.71) * 4.2;
    }
    // Air temp + sun (Vihma 2010 Stockholm Marathon: T air strongest predictor; solar also significant).
    // Unexpected sun on a ~20°C day often feels much harder than WBGT alone suggests.
    const solar = this.solarOffset(weather.weatherCode, weather.conditions);
    if (temp > 13) {
      const airSolar = (temp - 13) * (1.55 + solar * 0.42);
      thermal = Math.max(thermal, airSolar);
    }
    // Oppressive dew point (RunWeather sticky/oppressive bands)
    if (dew != null && dew > 18) thermal += (dew - 18) * 2.5;
    if (dew != null && dew > 21) thermal += (dew - 21) * 3;

    // Cold — research: peak air temps ~10–12°C; cold costs less than heat until extreme / wind chill
    let cold = 0;
    if (temp < 8) cold += (8 - temp) * 1.4;
    if (temp < 0) cold += (0 - temp) * 2.2;
    if (chill != null && temp < 8 && windEff > 8) {
      cold += Math.max(0, (temp - chill) * 1.15);
    }
    if (temp < 8 && humidity > 80) cold += ((humidity - 80) / 20) * 4;
    // Freezing / Arctic racing: airways, dexterity, thermal stress beyond the thermometer
    if (temp <= 1) cold += 10 + Math.max(0, -temp) * 1.2;

    // Mechanical wind drag (independent of WBGT; light breeze helps cooling, ignored)
    let windPenalty = 0;
    if (windEff > 12) windPenalty += (windEff - 12) * 0.7;
    if (windEff > 25) windPenalty += (windEff - 25) * 0.55;
    if (windEff > 40) windPenalty += (windEff - 40) * 0.45;
    windPenalty = Math.min(32, windPenalty);

    // Precipitation — independent of WBGT; mild-temp drizzle is mild, cold + wind soak is severe
    let rain = 0;
    if (rainMm > 0) {
      let base = 2 + Math.min(rainMm, 50) * 0.65;
      if (rainMm > 5) base += (rainMm - 5) * 0.4;
      if (rainMm > 20) base += (rainMm - 20) * 0.45;

      let mult = 1;
      if (temp >= 12 && temp <= 18) mult = 0.4;
      else if (temp >= 8 && temp < 12) mult = 0.8;
      else if (temp < 5) mult = 1.55;
      else if (temp < 8) mult = 1.3;

      if (windEff > 15 && rainMm > 0.5) mult += Math.min(0.7, (windEff - 15) / 35);
      if (humidity > 85 && temp < 10) mult += 0.2;

      // Cold drizzle + wind: mm can be low but still miserable (Bergen-style coastal damp)
      if (rainMm > 0.2 && rainMm <= 8 && temp < 8 && windEff > 14) {
        mult += 0.55 + (8 - temp) * 0.08 + Math.min(0.45, (windEff - 14) / 30);
        if (humidity > 75) mult += 0.15;
      }

      // Boston-style: heavy rain + near-freezing + strong wind
      if (rainMm > 15 && temp < 7 && windEff > 25) {
        mult += 0.55 + (rainMm - 15) * 0.008 + (7 - temp) * 0.04;
        if (humidity > 80) mult += (humidity - 80) * 0.004;
      }

      rain = base * mult;
      // Floor for cold wet wind so light precip still counts
      if (rainMm > 0.2 && temp < 8 && windEff > 14) {
        rain = Math.max(rain, 10 + (8 - temp) * 1.2 + (windEff - 14) * 0.35);
      }
    }
    rain = Math.min(65, rain);

    let snow = 0;
    if (snowCm > 0) {
      snow = 8 + snowCm * 6;
      if (temp < 0) snow *= 1.25;
    }
    snow = Math.min(35, snow);

    const elev = Math.min(10, (elevGain || 0) / 100);

    const score = Math.round(Math.max(0, thermal + cold + windPenalty + rain + snow + elev));
    const factors = [];
    if (thermal >= 6) factors.push({ key: 'thermal', label: 'Heat (WBGT)', value: Math.round(thermal) });
    if (cold >= 5) factors.push({ key: 'cold', label: 'Cold', value: Math.round(cold) });
    if (windPenalty >= 4) factors.push({ key: 'wind', label: 'Wind', value: Math.round(windPenalty) });
    if (rain >= 4) factors.push({ key: 'rain', label: 'Rain', value: Math.round(rain) });
    if (snow >= 4) factors.push({ key: 'snow', label: 'Snow', value: Math.round(snow) });
    if (elev >= 3) factors.push({ key: 'elev', label: 'Hills', value: Math.round(elev) });

    return {
      score,
      label: this.difficultyLabel(score),
      color: this.difficultyColor(score),
      factors,
      dewPoint: dew != null ? Math.round(dew * 10) / 10 : null,
      heatIndex: hi != null ? Math.round(hi * 10) / 10 : null,
      windChill: chill != null && temp < 10 && windEff > 8 ? Math.round(chill * 10) / 10 : null,
      wbgt: wbgt != null ? Math.round(wbgt * 10) / 10 : null,
    };
  },

  difficultyLabel(score) {
    if (score == null) return '—';
    if (score <= 15) return 'Ideal';
    if (score <= 30) return 'Good';
    if (score <= 45) return 'Fair';
    if (score <= 60) return 'Moderate';
    if (score <= 75) return 'Hard';
    if (score <= 100) return 'Brutal';
    return 'Extreme';
  },

  difficultyColor(score) {
    if (score == null) return 'var(--muted)';
    if (score <= 15) return '#22c55e';
    if (score <= 30) return '#86efac';
    if (score <= 45) return '#3b82f6';
    if (score <= 60) return '#fbbf24';
    if (score <= 75) return '#f97316';
    if (score <= 100) return '#ef4444';
    return '#991b1b';
  },

  /** Merge static weather JSON onto race records. */
  enrichRaces(races, weatherEntries, dateMap) {
    const byKey = new Map(
      (weatherEntries || []).map(w => [`${w.race}|${w.year}`, w]),
    );

    for (const race of races) {
      const key = `${race.name}|${race.year}`;
      const entry = byKey.get(key);
      const meta = dateMap?.get(key);
      race.raceDate = entry?.date || meta?.date || null;
      race.weather = entry ? {
        tempC: entry.tempC,
        tempMin: entry.tempMin,
        tempMax: entry.tempMax,
        humidity: entry.humidity,
        windKph: entry.windKph,
        windMaxKph: entry.windMaxKph,
        rainMm: entry.rainMm ?? entry.precipMm ?? 0,
        snowCm: entry.snowCm ?? 0,
        precipMm: entry.precipMm ?? (entry.rainMm ?? 0),
        weatherCode: entry.weatherCode,
        conditions: entry.conditions || this.deriveConditions({
          rainMm: entry.rainMm,
          snowCm: entry.snowCm,
          weatherCode: entry.weatherCode,
        }),
        windowStart: entry.windowStart,
        windowEnd: entry.windowEnd,
        windowSource: entry.windowSource,
        windowNote: entry.windowNote,
        weatherNote: entry.weatherNote,
        hoursSampled: entry.hoursSampled,
      } : null;
      race.difficulty = this.computeDifficulty(race.weather, meta?.elevGain ?? entry?.elevGain ?? 0);
    }
    return races;
  },

  weatherSummary(w) {
    if (!w) return '—';
    const parts = [];
    if (w.windowStart && w.windowEnd) parts.push(`${w.windowStart}–${w.windowEnd}`);
    if (w.tempMin != null && w.tempMax != null) parts.push(`${Math.round(w.tempMin)}–${Math.round(w.tempMax)}°C`);
    else if (w.tempC != null) parts.push(`${Math.round(w.tempC)}°C`);
    if (w.humidity != null) parts.push(`${Math.round(w.humidity)}% humidity`);
    if (w.windKph != null) parts.push(`${Math.round(w.windKph)} km/h wind${w.windMaxKph ? ` (max ${Math.round(w.windMaxKph)})` : ''}`);
    if (w.rainMm > 0.1) parts.push(`${w.rainMm.toFixed(1)} mm rain`);
    if (w.snowCm > 0.1) parts.push(`${w.snowCm.toFixed(1)} cm snow`);
    if (w.weatherNote) parts.push(w.weatherNote);
    return parts.join(' · ') || this.weatherLabel(w.weatherCode);
  },

  difficultyBadge(race) {
    const d = race?.difficulty;
    if (!d) return '<span style="color:var(--muted)">—</span>';
    const tip = d.dewPoint != null ? ` · dew ${d.dewPoint}°C` : '';
    return `<span class="difficulty-badge" style="--diff-color:${d.color}" title="${d.score} · ${d.label}${tip}">${d.score} · ${d.label}</span>`;
  },

  windowCell(race) {
    const w = race?.weather;
    if (!w?.windowStart) return '<span style="color:var(--muted)">—</span>';
    const src = w.windowSource === 'garmin' ? 'Garmin'
      : w.windowSource === 'official' ? 'Official' : 'Estimated';
    const tip = [w.windowNote, src].filter(Boolean).join(' · ');
    return `<span class="window-cell" title="${tip}">${w.windowStart}–${w.windowEnd}</span>`;
  },

  weatherCell(race) {
    const w = race?.weather;
    if (!w) return '<span style="color:var(--muted)">—</span>';
    const cond = w.conditions || this.weatherLabel(w.weatherCode);
    const precip = w.snowCm > 0 ? ` · ${w.snowCm}cm ❄` : w.rainMm > 0 ? ` · ${w.rainMm}mm 🌧` : '';
    return `<span class="weather-cell" title="${this.weatherSummary(w)}">${Math.round(w.tempC)}°C · ${Math.round(w.windKph)}km/h${precip || ` · ${cond}`}</span>`;
  },
};
