'use strict';

const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TIPS_URL = 'https://tipsaudit.com/api/v1/predictions';
const FOTMOB_URL = 'https://www.fotmob.com/api/data/matches?date=';
const DEFAULT_TZ = process.env.PROMO_TZ || 'Africa/Douala';
const TTL = 3 * 60 * 1000;

const cache = { tips: null, tipsAt: 0, fotmob: new Map() };

/* ─────────────── SPORTMONKS (scores live + cotes) ─────────────── */
const SPORTMONKS_KEY = String(process.env.SPORTMONKS_API_KEY || '').trim();
const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football';
const SM_TTL = 2 * 60 * 1000;
const smCache = { live: null, liveAt: 0, fixtures: new Map(), odds: new Map() };

async function getJson(url) {
  const res = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: s => s >= 200 && s < 300
  });
  return res.data;
}

async function fetchTips(force = false) {
  const now = Date.now();
  if (!force && cache.tips && now - cache.tipsAt < TTL) return cache.tips;
  const data = await getJson(TIPS_URL);
  if (!data || !Array.isArray(data.predictions)) throw new Error('Pronostics indisponibles');
  cache.tips = data;
  cache.tipsAt = now;
  return data;
}

async function fetchFotmob(dateCompact, force = false) {
  const now = Date.now();
  const hit = cache.fotmob.get(dateCompact);
  if (!force && hit && now - hit.at < TTL) return hit.data;
  try {
    const data = await getJson(FOTMOB_URL + dateCompact);
    cache.fotmob.set(dateCompact, { at: now, data });
    return data;
  } catch (e) {
    return null;
  }
}

function dateInTz(date, tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = t => (parts.find(p => p.type === t) || {}).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function timeInTz(date, tz = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date);
  } catch (e) {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
}

function dateLabelInTz(date, tz = DEFAULT_TZ) {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(date);
  } catch (e) {
    return date.toISOString().slice(0, 10);
  }
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(fc|cf|sc|ac|club|de|the|of|cd|ca|ec|afc|if|bk|fk|sk|sp|mg|pr)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loose(a, b) {
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

function buildFotmobIndex(fotmobData) {
  const list = [];
  for (const league of (fotmobData && fotmobData.leagues) || []) {
    for (const m of (league.matches || [])) {
      if (!m || !m.home || !m.away) continue;
      list.push({
        league: league.name || 'Autres',
        home: m.home.name,
        away: m.away.name,
        hs: m.home.score,
        as: m.away.score,
        timeTS: m.timeTS,
        status: m.status || {}
      });
    }
  }
  return list;
}

function findFotmob(index, home, away) {
  const nh = norm(home);
  const na = norm(away);
  for (const e of index) {
    const eh = norm(e.home);
    const ea = norm(e.away);
    if (loose(nh, eh) && loose(na, ea)) return e;
    if (loose(nh, ea) && loose(na, eh)) return { ...e, home: e.away, away: e.home, hs: e.as, as: e.hs, reversed: true };
  }
  return null;
}

function cleanMinute(s) {
  if (!s) return null;
  const m = String(s).replace(/[^\d+]/g, '');
  return m ? m + "'" : null;
}

/* ─────────────── SPORTMONKS : scores live et cotes bookmakers ─────────────── */

async function smGet(path, { params = {}, timeout = 20000 } = {}) {
  if (!SPORTMONKS_KEY) return null;
  const res = await axios.get(SPORTMONKS_BASE + path, {
    timeout,
    params: { ...params, api_token: SPORTMONKS_KEY },
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    validateStatus: s => s >= 200 && s < 300
  });
  return res.data;
}

function smParticipant(fixture, location) {
  return (fixture.participants || []).find(
    p => String(p.meta && p.meta.location || '').toLowerCase() === location
  );
}

function smScoreNumber(value) {
  if (value && typeof value === 'object') {
    const goals = Number(value.goals);
    return Number.isFinite(goals) ? goals : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function smScore(fixture, participantId) {
  if (!participantId) return null;
  const scores = Array.isArray(fixture.scores) ? fixture.scores : [];
  const own = scores.filter(s => String(s.participant_id) === String(participantId));
  if (!own.length) return null;
  const current = own.find(s => /current/i.test(String(s.description || ''))) || own[own.length - 1];
  return smScoreNumber(current && current.score);
}

function parseSportmonksFixture(f) {
  if (!f) return null;
  const homeP = smParticipant(f, 'home');
  const awayP = smParticipant(f, 'away');
  const fallback = String(f.name || '').split(/\s+vs\s+/i);
  const home = (homeP && homeP.name) || fallback[0] || '';
  const away = (awayP && awayP.name) || fallback[1] || '';
  if (!home || !away) return null;

  const state = f.state || {};
  const stateText = `${state.name || ''} ${state.short_name || ''}`.toLowerCase().trim();
  const stateId = Number(f.state_id);
  const started = stateId !== 1 && !/not started|\bns\b/.test(stateText);
  const finished = stateId === 5 || /\b(ft|aet|pen|full time|finished)\b/.test(stateText);
  const cancelled = /(cancelled|postponed|abandoned|awarded)/.test(stateText);

  const hs = smScore(f, homeP && homeP.id);
  const as = smScore(f, awayP && awayP.id);
  const score = hs != null && as != null
    ? { home: hs, away: as, text: `${hs} - ${as}` }
    : null;

  let minute = null;
  if (f.time && f.time.minute != null && Number.isFinite(Number(f.time.minute))) {
    minute = `${Number(f.time.minute)}'`;
  }

  const kickoff = f.starting_at_timestamp
    ? new Date(Number(f.starting_at_timestamp) * 1000)
    : (f.starting_at ? new Date(String(f.starting_at).replace(' ', 'T') + 'Z') : null);

  return {
    fixtureId: f.id,
    league: (f.league && f.league.name) || 'Autres',
    home,
    away,
    kickoff,
    score,
    minute,
    started,
    finished,
    cancelled,
    state
  };
}

async function getSportmonksLive(force = false) {
  if (!SPORTMONKS_KEY) return [];
  const now = Date.now();
  if (!force && smCache.live && now - smCache.liveAt < SM_TTL) return smCache.live;

  let list = [];
  try {
    let data = null;
    try {
      data = await smGet('/livescores/latest', {
        params: { include: 'participants;league;state;scores' }
      });
    } catch (e) {
      data = await smGet('/livescores/latest');
    }
    list = ((data && data.data) || []).map(parseSportmonksFixture).filter(Boolean);
  } catch (e) {
    list = [];
  }
  smCache.live = list;
  smCache.liveAt = now;
  return list;
}

async function getSportmonksFixtures(dateStr, force = false) {
  if (!SPORTMONKS_KEY) return [];
  const key = String(dateStr || '').slice(0, 10);
  if (!key) return [];
  const hit = smCache.fixtures.get(key);
  if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;

  try {
    const base = new Date(`${key}T12:00:00Z`);
    const start = dateInTz(new Date(base.getTime() - 24 * 3600 * 1000), 'UTC');
    const end = dateInTz(new Date(base.getTime() + 24 * 3600 * 1000), 'UTC');
    let data = null;
    try {
      data = await smGet(`/fixtures/between/${start}/${end}`, {
        params: { include: 'participants;league;state;scores' }
      });
    } catch (e) {
      data = await smGet(`/fixtures/between/${start}/${end}`);
    }
    const list = ((data && data.data) || []).map(parseSportmonksFixture).filter(Boolean);
    smCache.fixtures.set(key, { at: Date.now(), data: list });
    return list;
  } catch (e) {
    smCache.fixtures.set(key, { at: Date.now(), data: [] });
    return [];
  }
}

async function getSportmonksOdds(fixtureId, force = false) {
  if (!SPORTMONKS_KEY || !fixtureId) return null;
  const key = String(fixtureId);
  const hit = smCache.odds.get(key);
  if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.data;

  try {
    const data = await smGet(`/odds/pre-match/fixtures/${encodeURIComponent(fixtureId)}`);
    const rows = ((data && data.data) || []).filter(o =>
      Number(o.market_id) === 1 ||
      /full\s*time\s*result|match winner/i.test(String(o.market_description || ''))
    );

    const best = { home: 0, draw: 0, away: 0 };
    const books = { home: new Set(), draw: new Set(), away: new Set() };
    for (const o of rows) {
      const label = String(o.label || '').toLowerCase();
      const k = label.includes('home') ? 'home'
        : label.includes('draw') ? 'draw'
          : label.includes('away') ? 'away' : null;
      const value = Number(o.value);
      if (!k || !Number.isFinite(value) || value <= 1) continue;
      if (value > best[k]) best[k] = value;
      books[k].add(String(o.bookmaker_id));
    }

    if (!best.home || !best.draw || !best.away) {
      smCache.odds.set(key, { at: Date.now(), data: null });
      return null;
    }

    const out = {
      home: best.home,
      draw: best.draw,
      away: best.away,
      bookCount: Math.max(books.home.size, books.draw.size, books.away.size)
    };
    smCache.odds.set(key, { at: Date.now(), data: out });
    return out;
  } catch (e) {
    smCache.odds.set(key, { at: Date.now(), data: null });
    return null;
  }
}

async function enrichWithSportmonksOdds(matches, { concurrency = 2, force = false } = {}) {
  if (!matches.length || !SPORTMONKS_KEY) return matches;

  const dates = [...new Set(matches.map(mt => dateInTz(new Date(mt.kickoff), 'UTC')))];
  const lists = await Promise.all(dates.map(d => getSportmonksFixtures(d, force)));
  const index = new Map();
  for (const list of lists) {
    for (const f of list) {
      if (!f.kickoff) continue;
      index.set(norm(f.home) + '|' + norm(f.away) + '|' + dateInTz(f.kickoff, 'UTC'), f);
    }
  }

  await mapLimit(matches, concurrency, async (mt) => {
    const d = dateInTz(new Date(mt.kickoff), 'UTC');
    const direct = index.get(norm(mt.home) + '|' + norm(mt.away) + '|' + d);
    const reverse = index.get(norm(mt.away) + '|' + norm(mt.home) + '|' + d);
    const f = direct || reverse;
    if (!f) return;
    const odds = await getSportmonksOdds(f.fixtureId, force);
    if (!odds) return;
    mt.sm = direct
      ? odds
      : { home: odds.away, draw: odds.draw, away: odds.home, bookCount: odds.bookCount };
  });

  return matches;
}

function favorite(odds) {
  if (!odds) return null;
  const entries = [
    ['1', 'home', Number(odds.home)],
    ['X', 'draw', Number(odds.draw)],
    ['2', 'away', Number(odds.away)]
  ].filter(e => e[2] > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => a[2] - b[2]);
  return { label: entries[0][0], probKey: entries[0][1], odds: entries[0][2] };
}

async function getTodayMatches({ tz = DEFAULT_TZ, force = false } = {}) {
  const now = new Date();
  const today = dateInTz(now, 'UTC');
  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date(today + 'T12:00:00Z'));

  let tips = null;
  try { tips = await fetchTips(force); } catch (e) { tips = null; }

  if (!tips || !Array.isArray(tips.predictions)) {
    const fm = await fetchFotmob(today.replace(/-/g, ''), force);
    const index = fm ? buildFotmobIndex(fm) : [];
    const matches = index.map(e => {
      const st = e.status || {};
      let score = st.scoreStr || null;
      if (!score && e.hs != null && e.as != null) score = `${e.hs} - ${e.as}`;
      return {
        league: (e.league || 'Autres').trim(),
        home: e.home,
        away: e.away,
        kickoff: e.timeTS ? new Date(e.timeTS) : new Date(now),
        odds: null,
        probs: null,
        tip: null,
        tipOdds: null,
        tipProb: null,
        value: null,
        valueEdge: null,
        live: {
          score,
          started: !!st.started,
          finished: !!st.finished,
          cancelled: !!st.cancelled,
          minute: cleanMinute(st.liveTime && st.liveTime.short)
        },
        url: null
      };
    });
    matches.sort((a, b) => a.kickoff - b.kickoff);
    return { date: today, tz, dateLabel, matches, fallback: true };
  }

  const todays = (tips.predictions || []).filter(p => {
    if (!p || !p.kickoff_utc) return false;
    const d = new Date(p.kickoff_utc);
    return !isNaN(d.getTime()) && dateInTz(d, 'UTC') === today;
  });

  const utcDates = [...new Set(todays.map(p => {
    const d = new Date(p.kickoff_utc);
    return dateInTz(d, 'UTC').replace(/-/g, '');
  }))];

  const fmIndex = [];
  for (const d of utcDates) {
    const fm = await fetchFotmob(d, force);
    if (fm) fmIndex.push(...buildFotmobIndex(fm));
  }

  const matches = todays.map(p => {
    const kickoff = new Date(p.kickoff_utc);
    const fm = findFotmob(fmIndex, p.home, p.away);
    const odds = p.fair_odds || null;
    const probs = p.fair_probabilities || null;
    const fav = favorite(odds);
    const prob = fav && probs ? Number(probs[fav.probKey]) : null;
    const st = fm ? fm.status : null;
    let live = null;
    if (fm) {
      const started = !!(st && st.started);
      const finished = !!(st && st.finished);
      const cancelled = !!(st && st.cancelled);
      let score = null;
      if (fm.reversed) {
        if (fm.hs != null && fm.as != null) score = `${fm.hs} - ${fm.as}`;
      } else {
        score = st && st.scoreStr;
        if (!score && fm.hs != null && fm.as != null) score = `${fm.hs} - ${fm.as}`;
      }
      live = {
        score: score || null,
        started,
        finished,
        cancelled,
        minute: cleanMinute(st && st.liveTime && st.liveTime.short)
      };
    }
    return {
      league: (p.league || 'Autres').trim(),
      home: p.home,
      away: p.away,
      kickoff,
      odds,
      probs,
      tip: fav ? fav.label : null,
      tipOdds: fav ? fav.odds : null,
      tipProb: prob != null && !isNaN(prob) ? Math.round(prob * 100) : null,
      value: p.value && p.value.selection ? p.value.selection : null,
      valueEdge: p.value && p.value.price_gap != null ? Number(p.value.price_gap) : null,
      live,
      url: p.url || null
    };
  });

  // Vérification / mise à jour des scores live via SportMonks (si la clé est configurée).
  if (SPORTMONKS_KEY) {
    try {
      const smLive = await getSportmonksLive(force);
      if (smLive.length) {
        const byKey = new Map(smLive.map(x => [norm(x.home) + '|' + norm(x.away), x]));
        for (const mt of matches) {
          const directKey = norm(mt.home) + '|' + norm(mt.away);
          const reverseKey = norm(mt.away) + '|' + norm(mt.home);
          const sm = byKey.get(directKey) || byKey.get(reverseKey);
          if (!sm) continue;
          const reversed = !byKey.has(directKey);
          let score = sm.score ? sm.score.text : null;
          if (reversed && sm.score) score = `${sm.score.away} - ${sm.score.home}`;
          mt.live = {
            ...(mt.live || {}),
            score: score || mt.live && mt.live.score,
            started: sm.started,
            finished: sm.finished,
            cancelled: sm.cancelled,
            minute: sm.minute || (mt.live && mt.live.minute),
            source: 'SportMonks'
          };
        }
      }
    } catch (e) { /* best-effort : ne jamais bloquer les pronostics */ }
  }

  matches.sort((a, b) => a.kickoff - b.kickoff);
  return { date: today, tz, dateLabel, matches };
}

async function getLiveMatches({ force = false } = {}) {
  const now = new Date();
  const dates = [...new Set([
    dateInTz(now, 'UTC'),
    dateInTz(new Date(now.getTime() - 24 * 3600 * 1000), 'UTC')
  ])];

  const index = [];
  for (const d of dates) {
    const fm = await fetchFotmob(d.replace(/-/g, ''), force);
    if (fm) index.push(...buildFotmobIndex(fm));
  }

  const seen = new Set();
  const live = [];
  for (const e of index) {
    const st = e.status || {};
    if (!st.started || st.finished) continue;
    const key = norm(e.home) + '|' + norm(e.away);
    if (seen.has(key)) continue;
    seen.add(key);
    live.push({
      league: e.league || 'Autres',
      home: e.home,
      away: e.away,
      score: st.scoreStr || (e.hs != null && e.as != null ? `${e.hs} - ${e.as}` : null),
      minute: cleanMinute(st.liveTime && st.liveTime.short),
      kickoff: e.timeTS ? new Date(e.timeTS) : null
    });
  }

  // Complément / vérification des scores live via SportMonks.
  if (SPORTMONKS_KEY) {
    try {
      const smLive = await getSportmonksLive(force);
      for (const sm of smLive) {
        const key = norm(sm.home) + '|' + norm(sm.away);
        const existing = live.find(x => {
          const k = norm(x.home) + '|' + norm(x.away);
          return k === key || k === norm(sm.away) + '|' + norm(sm.home);
        });
        if (existing) {
          const reversed = norm(existing.home) !== norm(sm.home);
          if (sm.score) existing.score = reversed ? `${sm.score.away} - ${sm.score.home}` : sm.score.text;
          if (sm.minute) existing.minute = sm.minute;
          existing.source = 'SportMonks';
        } else {
          live.push({
            league: sm.league,
            home: sm.home,
            away: sm.away,
            score: sm.score ? sm.score.text : null,
            minute: sm.minute,
            kickoff: sm.kickoff,
            source: 'SportMonks'
          });
        }
      }
    } catch (e) { /* best-effort */ }
  }

  live.sort((a, b) => {
    if (a.league !== b.league) return a.league.localeCompare(b.league);
    return (a.kickoff ? a.kickoff.getTime() : 0) - (b.kickoff ? b.kickoff.getTime() : 0);
  });
  return live;
}

/* ─────────────── COTES RÉELLES (Infersports MCP, sans clé) ─────────────── */

const INFER_URL = 'https://api.infersports.dev/mcp';
const REAL_TTL = 5 * 60 * 1000;
const realCache = new Map();
let inferReady = false;
let inferSeq = 10;

async function inferRpc(body) {
  const res = await axios.post(INFER_URL, body, {
    timeout: 25000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'User-Agent': UA
    },
    validateStatus: s => s >= 200 && s < 300
  });
  let data = res.data;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch (e) {
      for (const block of data.split(/\n\n/)) {
        const d = block.split(/\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
        if (d.length) { try { data = JSON.parse(d.join('\n')); break; } catch (e2) { /* ignore */ } }
      }
    }
  }
  return data;
}

async function inferEnsure() {
  if (inferReady) return;
  await inferRpc({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'djs-bot', version: '1.0.0' }
    }
  });
  try { await inferRpc({ jsonrpc: '2.0', method: 'notifications/initialized' }); } catch (e) { /* ignore */ }
  inferReady = true;
}

async function inferTool(name, args) {
  await inferEnsure();
  const id = inferSeq++;
  const json = await inferRpc({
    jsonrpc: '2.0', id, method: 'tools/call',
    params: { name, arguments: args }
  });
  const content = json && json.result && json.result.content;
  if (!content || !content.length) return null;
  try { return JSON.parse(content[0].text); } catch (e) { return null; }
}

async function getSharpLine(mt) {
  const query = `${mt.home} vs ${mt.away}`;
  const date = new Date(mt.kickoff).toISOString().slice(0, 10);
  const r = await inferTool('get_sharp_line', {
    query,
    market_type: '1x2',
    period: 'full_time',
    format: 'decimal',
    sport: 'football',
    date,
    verbosity: 'full'
  });
  if (!r || r.status !== 'ok') return null;
  const cmp = r.comparison || {};
  const best = {};
  for (const p of (cmp.best_prices || [])) best[p.outcome] = p.price;
  const books = Number(cmp.book_count) || 0;
  if (!books || !best.home || !best.draw || !best.away) return null;
  return {
    home: best.home,
    draw: best.draw,
    away: best.away,
    bookCount: books,
    fair: cmp.fair_odds || null,
    fairFrom: cmp.fair_from || null
  };
}

async function mapLimit(items, limit, fn) {
  const arr = [...items];
  const out = new Array(arr.length);
  let idx = 0;
  async function worker() {
    while (idx < arr.length) {
      const i = idx++;
      try { out[i] = await fn(arr[i], i); } catch (e) { out[i] = null; }
    }
  }
  const n = Math.max(1, Math.min(limit, arr.length));
  await Promise.all(Array.from({ length: n }, worker));
  return out;
}

async function enrichWithRealOdds(matches, { concurrency = 5, force = false } = {}) {
  if (!matches.length) return matches;
  await mapLimit(matches, concurrency, async (mt) => {
    const date = new Date(mt.kickoff).toISOString().slice(0, 10);
    const key = norm(mt.home) + '|' + norm(mt.away) + '|' + date;
    const now = Date.now();
    const hit = realCache.get(key);
    if (!force && hit && now - hit.at < REAL_TTL) {
      mt.real = hit.data;
      return;
    }
    try {
      const real = await getSharpLine(mt);
      mt.real = real;
      realCache.set(key, { at: now, data: real });
    } catch (e) {
      mt.real = null;
    }
  });
  return matches;
}

async function getSharpLineByQuery(query, date) {
  const args = {
    query,
    market_type: '1x2',
    period: 'full_time',
    format: 'decimal',
    sport: 'football',
    verbosity: 'full'
  };
  if (date) args.date = date;
  const r = await inferTool('get_sharp_line', args);
  if (!r || r.status !== 'ok') return null;
  const cmp = r.comparison || {};
  const fair = cmp.fair_odds || null;
  if (!fair || !fair.home || !fair.draw || !fair.away) return null;
  const best = {};
  for (const p of (cmp.best_prices || [])) best[p.outcome] = p.price;
  const m = r.match || {};
  return {
    home: m.home_team || null,
    away: m.away_team || null,
    fair: { home: fair.home, draw: fair.draw, away: fair.away },
    best: { home: best.home, draw: best.draw, away: best.away },
    bookCount: Number(cmp.book_count) || 0,
    fairFrom: cmp.fair_from || null
  };
}

async function getRealOddsByEvent(eventId) {
  const cmp = await inferTool('compare_lines', {
    event_id: eventId,
    market_type: '1x2',
    period: 'full_time',
    verbosity: 'terse'
  });
  if (!cmp) return null;
  const best = {};
  for (const p of (cmp.best_prices || [])) best[p.outcome] = p.price;
  const books = Number(cmp.book_count) || 0;
  if (!books || !best.home || !best.draw || !best.away) return null;
  return {
    home: best.home,
    draw: best.draw,
    away: best.away,
    bookCount: books,
    fair: cmp.fair_odds || null,
    fairFrom: cmp.fair_from || null
  };
}

async function getBookmakerMatches({ limit = 50 } = {}) {
  await inferEnsure();
  const r = await inferTool('scan_slate', { sport: 'football', limit, only_signal: false });
  if (!r || !Array.isArray(r.entries)) return [];
  return r.entries
    .filter(e => e.status !== 'finished')
    .map(e => ({
      league: e.league || 'Autres',
      home: e.home_team,
      away: e.away_team,
      kickoff: new Date(e.scheduled_at),
      status: e.status,
      score: e.score || null,
      clock: e.clock || null,
      bookCount: Number(e.book_count) || 0,
      valueCount: Number(e.value_count) || 0,
      arbCount: Number(e.arb_count) || 0,
      eventId: e.event_id
    }))
    .filter(e => e.bookCount > 0)
    .sort((a, b) => a.kickoff - b.kickoff);
}

async function enrichBookmakerMatches(matches, { concurrency = 5 } = {}) {
  if (!matches.length) return matches;
  await mapLimit(matches, concurrency, async (mt) => {
    const key = 'evt|' + mt.eventId;
    const now = Date.now();
    const hit = realCache.get(key);
    if (hit && now - hit.at < REAL_TTL) { mt.real = hit.data; return; }
    try {
      const real = await getRealOddsByEvent(mt.eventId);
      mt.real = real;
      realCache.set(key, { at: now, data: real });
    } catch (e) {
      mt.real = null;
    }
  });
  return matches;
}

/* ─────────────── BET BETTER (probabilités + cotes justes) ─────────────── */
const BETBETTER_BASE = 'https://betbetter.world';
const BETBETTER_TTL = 15 * 60 * 1000;
const BETBETTER_LEAGUES = [
  ['epl', 'Premier League'],
  ['efl-championship', 'Championship'],
  ['la-liga', 'La Liga'],
  ['serie-a', 'Serie A'],
  ['bundesliga', 'Bundesliga'],
  ['ligue-1', 'Ligue 1'],
  ['mls', 'MLS'],
  ['brazil-serie-a', 'Brasileirão'],
  ['world-cup', 'Coupe du Monde'],
  ['a-league', 'A-League']
];
const betBetterCache = { at: 0, picks: [] };

function betBetterSelection(pick) {
  const selection = String(pick.selection || '').trim();
  const line = pick.line != null && pick.line !== '' ? ` ${pick.line}` : '';
  const market = String(pick.market || '').trim().toLowerCase();
  if (market === 'head to head') {
    return /^draw$/i.test(selection) ? 'X (Nul)' : selection;
  }
  return `${selection}${line}`.trim();
}

/**
 * API gratuite Bet Better (CC BY 4.0, sans clé) : probabilités du modèle
 * et cotes justes. On ne garde que les picks football gratuits qui respectent
 * le filtre du bot (> 50% et cote > 1.50).
 */
async function getBetBetterPicks({ force = false, limit = 10 } = {}) {
  const now = Date.now();
  if (!force && betBetterCache.at && now - betBetterCache.at < BETBETTER_TTL) {
    return betBetterCache.picks.slice(0, limit);
  }

  const results = await Promise.allSettled(
    BETBETTER_LEAGUES.map(async ([path, label]) => {
      const url = `${BETBETTER_BASE}/soccer/${path}/best-bets?format=json&free=1`;
      const data = await getJson(url);
      if (!data || !Array.isArray(data.picks)) return [];

      return data.picks.map((pick) => {
        if (pick.locked || pick.leanOnly) return null;
        const prob = Number(pick.modelProbabilityPct);
        const odd = Number(pick.fairOdds);
        if (!Number.isFinite(prob) || !Number.isFinite(odd)) return null;
        if (prob <= 50 || odd <= 1.5) return null;

        const kickoff = new Date(pick.gameTimeUtc);
        if (Number.isNaN(kickoff.getTime())) return null;

        const game = String(pick.game || '').trim();
        const parts = game.split(' @ ');
        const away = (parts.length > 1 ? parts[0] : '').trim();
        const home = (parts.length > 1 ? parts[1] : parts[0]).trim();
        if (!home || !away) return null;

        return {
          source: 'Bet Better',
          league: label,
          home,
          away,
          kickoff,
          market: String(pick.market || '').trim(),
          pickLabel: betBetterSelection(pick),
          prob: prob / 100,
          odd,
          book: null,
          edge: null,
          confidence: pick.confidence || null
        };
      }).filter(Boolean);
    })
  );

  const picks = results
    .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    .filter(p => p && p.home && p.away && p.pickLabel)
    .sort((a, b) => b.prob - a.prob);

  betBetterCache.at = now;
  betBetterCache.picks = picks;
  return picks.slice(0, limit);
}

module.exports = {
  getTodayMatches,
  getLiveMatches,
  getSportmonksLive,
  getBetBetterPicks,
  enrichWithSportmonksOdds,
  enrichWithRealOdds,
  getBookmakerMatches,
  enrichBookmakerMatches,
  getSharpLineByQuery,
  dateInTz,
  timeInTz,
  dateLabelInTz,
  cleanMinute,
  norm,
  DEFAULT_TZ
};
