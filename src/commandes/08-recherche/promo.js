'use strict';

const style = require('../../config/style');
const { getTodayMatches, getLiveMatches, enrichWithRealOdds, enrichWithSportmonksOdds, getBookmakerMatches, enrichBookmakerMatches, getSharpLineByQuery, timeInTz, DEFAULT_TZ, norm } = require('../../lib/promo');

const PAGE_SIZE = 12;

function fmtOdds(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v.toFixed(2) : '-';
}

function oddsText(mt) {
  const o = mt.real || mt.odds;
  if (!o) return 'cotes indisponibles';
  const prefix = mt.real ? '🏦' : '≈';
  const suffix = mt.real ? ` (${mt.real.bookCount} books)` : ' (équitables)';
  return `${prefix} 1·${fmtOdds(o.home)}  X·${fmtOdds(o.draw)}  2·${fmtOdds(o.away)}${suffix}`;
}

function statusText(mt) {
  const l = mt.live;
  if (!l) return '';
  if (l.cancelled) return '🚫 Annulé';
  if (l.finished && l.score) return `✅ ${l.score} (Terminé)`;
  if (l.started && l.score) return `🔴 ${l.score}${l.minute ? ' (' + l.minute + ')' : ''}`;
  if (l.started) return '🔴 En cours';
  return '';
}

function renderMatches(matches, tz) {
  const byLeague = new Map();
  for (const mt of matches) {
    if (!byLeague.has(mt.league)) byLeague.set(mt.league, []);
    byLeague.get(mt.league).push(mt);
  }

  const order = [...byLeague.keys()].sort((a, b) => {
    const minA = Math.min(...byLeague.get(a).map(x => x.kickoff.getTime()));
    const minB = Math.min(...byLeague.get(b).map(x => x.kickoff.getTime()));
    return minA - minB;
  });

  const lines = [];
  for (const lg of order) {
    lines.push(style.title(lg));
    const arr = byLeague.get(lg).sort((a, b) => a.kickoff - b.kickoff);
    for (const mt of arr) {
      const time = timeInTz(mt.kickoff, tz);
      const st = statusText(mt);
      let first = `${time}  ${mt.home} vs ${mt.away}`;
      if (st) first += `  ${st}`;
      lines.push(style.row(first));

      lines.push(style.row(`  ${oddsText(mt)}`));
      if (mt.tip) {
        let prono = `  🎯 ${mt.tip}`;
        if (mt.tipProb != null) prono += ` (${mt.tipProb}%)`;
        if (mt.value) {
          prono += ` 💎 ${mt.value}`;
          if (mt.valueEdge != null && isFinite(mt.valueEdge)) {
            prono += ` +${(mt.valueEdge * 100).toFixed(1)}%`;
          }
        }
        lines.push(style.row(prono));
      }
    }
    lines.push(style.blank());
  }
  return lines;
}

function renderLive(matches) {
  const byLeague = new Map();
  for (const mt of matches) {
    if (!byLeague.has(mt.league)) byLeague.set(mt.league, []);
    byLeague.get(mt.league).push(mt);
  }
  const lines = [];
  for (const lg of [...byLeague.keys()]) {
    lines.push(style.title(lg));
    for (const mt of byLeague.get(lg)) {
      const minute = mt.minute ? ` ${mt.minute}` : '';
      const score = mt.score || '0 - 0';
      lines.push(style.row(`🔴${minute}  ${mt.home} ${score} ${mt.away}`));
    }
    lines.push(style.blank());
  }
  return lines;
}

function scoreText(mt) {
  if (mt.status === 'live') {
    const s = mt.score ? `${mt.score.home} - ${mt.score.away}` : '0 - 0';
    return `  🔴 ${mt.clock ? mt.clock + ' ' : ''}${s}`;
  }
  if (mt.score && mt.status !== 'scheduled') {
    return `  ✅ ${mt.score.home} - ${mt.score.away}`;
  }
  return '';
}

/* ─────────────── TICKET / COUPON ─────────────── */

const PICK_KEY = { '1': 'home', X: 'draw', '2': 'away' };
const PICK_LABEL = { '1': '1 (Domicile)', X: 'X (Nul)', '2': '2 (Extérieur)' };

function pickFromMatch(mt) {
  const probs = mt.probs || {};
  const entries = [
    ['1', Number(probs.home)],
    ['X', Number(probs.draw)],
    ['2', Number(probs.away)]
  ].filter(([, p]) => Number.isFinite(p) && p > 0 && p < 1);

  if (entries.length) {
    entries.sort((a, b) => b[1] - a[1]);
    return { label: entries[0][0], prob: entries[0][1] };
  }

  const fair = mt.odds || {};
  const oddsEntries = [
    ['1', Number(fair.home)],
    ['X', Number(fair.draw)],
    ['2', Number(fair.away)]
  ].filter(([, o]) => Number.isFinite(o) && o > 1);

  if (!oddsEntries.length) return null;
  oddsEntries.sort((a, b) => a[1] - b[1]);
  const label = oddsEntries[0][0];
  return { label, prob: 1 / oddsEntries[0][1] };
}

function marketOddFor(mt, pick) {
  const k = PICK_KEY[pick.label] || 'home';
  const markets = [mt.real, mt.sm].filter(Boolean);
  let book = null;
  for (const market of markets) {
    const value = Number(market[k]);
    if (!Number.isFinite(value) || value <= 1) continue;
    if (!book || value > Number(book[k])) book = market;
  }

  const fair = mt.odds ? Number(mt.odds[k]) : NaN;
  const bookOdd = book ? Number(book[k]) : NaN;
  if (Number.isFinite(bookOdd) && bookOdd > 1) {
    return { odd: bookOdd, book };
  }
  if (Number.isFinite(fair) && fair > 1) {
    return { odd: fair, book: null };
  }
  return { odd: null, book: null };
}

function pickBadge(prob) {
  if (prob >= 0.65) return '✅ FIABLE';
  if (prob >= 0.55) return '⚠️ MODÉRÉ';
  return '🔥 RISQUÉ';
}

function couponRisk(combinedProb, worstProb) {
  if (combinedProb >= 0.55 && worstProb >= 0.65) return '✅ PRUDENT';
  if (combinedProb >= 0.28 && worstProb >= 0.55) return '⚠️ MODÉRÉ';
  return '🔥 RISQUÉ';
}

function fmtMoney(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return new Intl.NumberFormat('fr-FR').format(n).replace(/[\u202f\u00a0]/g, ' ');
}

function parseTicketArgs(a) {
  const rest = (a || []).slice(1).map(x => String(x).toLowerCase());
  let liveOnly = false;
  let safe = false;
  let size = null;
  let stake = null;

  for (const x of rest) {
    if (['live', 'direct', 'encours', 'en-cours', 'inplay'].includes(x)) liveOnly = true;
    else if (['safe', 'sur', 'sûr', 'prudent', 'securise', 'sécurisé', 'fiable'].includes(x)) safe = true;
    else if (/^\d+$/.test(x)) {
      const n = parseInt(x, 10);
      if (size == null && n >= 1 && n <= 10) size = n;
      else if (stake == null && n >= 100) stake = n;
    }
  }

  if (safe && !size) size = 2;
  if (!size) size = parseInt(process.env.PROMO_TICKET_SIZE || '3', 10) || 3;
  if (!stake) stake = parseInt(process.env.PROMO_STAKE || '1000', 10) || 1000;

  return {
    liveOnly,
    safe,
    size: Math.max(1, Math.min(10, size)),
    stake: Math.max(100, Math.min(1000000, stake))
  };
}

function ticketPickLine(mt) {
  const pick = pickFromMatch(mt);
  if (!pick) return null;
  const market = marketOddFor(mt, pick);
  if (!market.odd) return null;
  return `🎯 ${PICK_LABEL[pick.label]} @ ${market.book ? '🏦' : '≈'}${fmtOdds(market.odd)} • ${(pick.prob * 100).toFixed(1)}% • ${pickBadge(pick.prob)}`;
}

function renderLiveWithTips(matches, tz) {
  const byLeague = new Map();
  for (const mt of matches) {
    if (!byLeague.has(mt.league)) byLeague.set(mt.league, []);
    byLeague.get(mt.league).push(mt);
  }

  const lines = [];
  for (const lg of [...byLeague.keys()]) {
    lines.push(style.title(lg));
    for (const mt of byLeague.get(lg)) {
      const minute = (mt.live && mt.live.minute) || '';
      const score = (mt.live && mt.live.score) || '0 - 0';
      lines.push(style.row(`🔴 ${minute ? minute + ' ' : ''}${mt.home} ${score} ${mt.away}`));
      const pick = ticketPickLine(mt);
      if (pick) lines.push(style.row('  ' + pick));
    }
    lines.push(style.blank());
  }
  return lines;
}

function renderBooks(matches, tz) {
  const byLeague = new Map();
  for (const mt of matches) {
    if (!byLeague.has(mt.league)) byLeague.set(mt.league, []);
    byLeague.get(mt.league).push(mt);
  }
  const order = [...byLeague.keys()].sort((a, b) => {
    const minA = Math.min(...byLeague.get(a).map(x => x.kickoff.getTime()));
    const minB = Math.min(...byLeague.get(b).map(x => x.kickoff.getTime()));
    return minA - minB;
  });
  const lines = [];
  for (const lg of order) {
    lines.push(style.title(lg));
    const arr = byLeague.get(lg).sort((a, b) => a.kickoff - b.kickoff);
    for (const mt of arr) {
      const time = timeInTz(mt.kickoff, tz);
      lines.push(style.row(`${time}  ${mt.home} vs ${mt.away}${scoreText(mt)}`));
      if (mt.real) {
        lines.push(style.row(`  🏦 1·${fmtOdds(mt.real.home)}  X·${fmtOdds(mt.real.draw)}  2·${fmtOdds(mt.real.away)} (${mt.real.bookCount} books)`));
      } else {
        lines.push(style.row(`  🏦 ${mt.bookCount} book(s) — cotes indisponibles`));
      }
      if (mt.valueCount || mt.arbCount) {
        const bits = [];
        if (mt.valueCount) bits.push(`⚡ ${mt.valueCount} value`);
        if (mt.arbCount) bits.push(`🔁 ${mt.arbCount} arb`);
        lines.push(style.row('  ' + bits.join(' • ')));
      }
    }
    lines.push(style.blank());
  }
  return lines;
}

module.exports = {
  name: 'promo',
  aliases: ['pronostic', 'pronostics', 'prono', 'pronos', 'tips', 'cotes', 'odds'],
  category: 'recherche',
  description: 'Pronostics, ticket/coupon complet et cotes des matchs de football',
  async execute(sock, m, from, args) {
    try {
      const a = (args || []).map(x => String(x));
      const sub = (a[0] || '').toLowerCase().trim();

      await sock.sendMessage(from, { text: style.renderInfo(['Recherche des matchs et cotes du jour...']) }, { quoted: m });

      if (sub === 'books' || sub === 'book' || sub === 'reel') {
        const tz = DEFAULT_TZ;
        const dateLabel = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
        }).format(new Date());
        const wanted = Math.max(1, parseInt(a[1] || '1', 10) || 1);
        const all = await getBookmakerMatches({ limit: 50 });
        if (!all.length) {
          return sock.sendMessage(from, { text: style.renderInfo(['Aucun match avec cotes bookmakers pour le moment.']) }, { quoted: m });
        }
        const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
        const cur = Math.min(wanted, pages);
        const slice = all.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
        await enrichBookmakerMatches(slice);
        const text = [
          style.frameHeader('COTES BOOKMAKERS'),
          style.row(`📅 ${dateLabel} • ${all.length} match(s) avec cotes`),
          style.row(`🕒 Heures : ${tz}`),
          style.blank(),
          ...renderBooks(slice, tz),
          ...(pages > 1 ? [style.row(`Page ${cur}/${pages} • .promo books ${cur < pages ? cur + 1 : 1}`), style.blank()] : []),
          style.row('Cotes réelles : Crown, Sbobet, Macau, M8bet, Nova88, HKJC'),
          style.row('Source : Infersports (gratuit, sans clé)'),
          style.row('⚡ = value bet • 🔁 = arbitrage'),
          style.frameFooter()
        ].join('\n');
        return sock.sendMessage(from, { text }, { quoted: m });
      }

      const { dateLabel, tz, matches, fallback } = await getTodayMatches();

      if (sub === 'compare' || sub === 'comparer' || sub === 'calc') {
        const rest = a.slice(1);
        const vals = [];
        while (rest.length && vals.length < 3 && /^\d+(?:[.,]\d+)?$/.test(rest[rest.length - 1])) {
          vals.unshift(Number(rest.pop().replace(',', '.')));
        }
        const query = rest.join(' ').trim();
        if (vals.length !== 3 || !query) {
          return sock.sendMessage(from, { text: style.renderInfo([
            'Usage : .promo compare <équipe> <cote1> <coteX> <cote2>',
            'Ex : .promo compare Portugal 1.85 3.60 4.50'
          ]) }, { quoted: m });
        }

        let fair = null;
        let label = query;
        const q = query.toLowerCase();
        const mt = matches.find(x =>
          (x.home + ' vs ' + x.away).toLowerCase().includes(q) ||
          x.home.toLowerCase().includes(q) ||
          x.away.toLowerCase().includes(q)
        );
        if (mt) {
          label = `${mt.home} vs ${mt.away}`;
          fair = (mt.real && mt.real.fair) || mt.odds || null;
          if (!fair) {
            const r = await getSharpLineByQuery(label, mt.kickoff.toISOString().slice(0, 10));
            if (r) fair = r.fair;
          }
        } else {
          const r = await getSharpLineByQuery(query);
          if (r) {
            fair = r.fair;
            if (r.home && r.away) label = `${r.home} vs ${r.away}`;
          }
        }

        if (!fair) {
          return sock.sendMessage(from, { text: style.renderInfo([
            `Pas de cotes de référence pour « ${query} ».`,
            'Essaie .promo <équipe> pour voir le match.'
          ]) }, { quoted: m });
        }

        const outcomes = [
          ['1', vals[0], fair.home],
          ['X', vals[1], fair.draw],
          ['2', vals[2], fair.away]
        ];
        const lines = [
          style.frameHeader('COMPARE COTES'),
          style.row(label),
          style.row(`Réf. : 1·${fmtOdds(fair.home)}  X·${fmtOdds(fair.draw)}  2·${fmtOdds(fair.away)}`),
          style.row(`Toi  : 1·${fmtOdds(vals[0])}  X·${fmtOdds(vals[1])}  2·${fmtOdds(vals[2])}`),
          style.blank()
        ];
        for (const [lab, u, f] of outcomes) {
          const ev = (u / f - 1) * 100;
          lines.push(style.row(`${lab} → ${ev >= 0 ? '+' : ''}${ev.toFixed(1)}%  ${ev > 0 ? '✅ value' : '❌ pas value'}`));
        }
        lines.push(style.blank());
        lines.push(style.row('⚠️ Value = avantage statistique, pas une garantie.'));
        lines.push(style.row('Ne mise que ce que tu peux perdre. 18+.'));
        lines.push(style.frameFooter());
        return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: m });
      }

      if (!matches.length) {
        return sock.sendMessage(from, { text: style.renderInfo(['Aucun match de football trouvé aujourd\'hui.']) }, { quoted: m });
      }

      if (['ticket', 'coupon', 'combo', 'pari', 'paris', 'bet'].includes(sub)) {
        const opts = parseTicketArgs(a);
        let pool = matches.filter(mt => !(mt.live && (mt.live.cancelled || mt.live.finished)));
        if (opts.liveOnly) {
          pool = pool.filter(mt => mt.live && mt.live.started && !mt.live.finished);
        }

        const candidates = pool
          .map(mt => {
            const pick = pickFromMatch(mt);
            return pick ? { mt, pick } : null;
          })
          .filter(Boolean)
          .sort((x, y) => y.pick.prob - x.pick.prob);

        if (!candidates.length) {
          return sock.sendMessage(from, { text: style.renderInfo([
            opts.liveOnly
              ? 'Aucun match en direct avec un pronostic exploitable pour le moment.'
              : 'Aucun pronostic exploitable pour construire un coupon.',
            'Réessaie un peu plus tard ou tape .promo pour voir les matchs.'
          ]) }, { quoted: m });
        }

        const chosen = candidates.slice(0, opts.size);
        await Promise.all([
          enrichWithRealOdds(chosen.map(c => c.mt)),
          enrichWithSportmonksOdds(chosen.map(c => c.mt))
        ]);

        const picks = chosen
          .map(c => {
            const market = marketOddFor(c.mt, c.pick);
            return {
              mt: c.mt,
              pick: c.pick,
              odd: market.odd,
              book: market.book,
              prob: c.pick.prob
            };
          })
          .filter(p => Number.isFinite(p.odd) && p.odd > 1);

        if (!picks.length) {
          return sock.sendMessage(from, { text: style.renderInfo([
            'Cotes indisponibles pour construire le coupon.',
            'Réessaie dans quelques minutes.'
          ]) }, { quoted: m });
        }

        const combinedOdds = picks.reduce((acc, p) => acc * p.odd, 1);
        const combinedProb = picks.reduce((acc, p) => acc * p.prob, 1);
        const worstProb = Math.min(...picks.map(p => p.prob));
        const risk = couponRisk(combinedProb, worstProb);
        const potential = opts.stake * combinedOdds;

        const lines = [
          style.frameHeader('TICKET PRONOSTIC'),
          style.row(`📅 ${dateLabel} • ${tz}`),
          style.row(`🎟️ ${picks.length} sélection(s) ${opts.liveOnly ? '• EN DIRECT' : ''}`.trim()),
          style.row('🚫 Aucun code promo requis'),
          style.blank()
        ];

        picks.forEach((p, index) => {
          const mt = p.mt;
          const time = timeInTz(mt.kickoff, tz);
          const st = statusText(mt);
          const edge = p.book ? p.prob * p.odd - 1 : null;

          lines.push(style.title(`${index + 1}. ${mt.league}`));
          lines.push(style.row(`${time}  ${mt.home} vs ${mt.away}${st ? '  ' + st : ''}`));
          lines.push(style.row(`🎯 ${PICK_LABEL[p.pick.label]} @ ${p.book ? '🏦' : '≈'}${fmtOdds(p.odd)}`));
          lines.push(style.row(`📊 Probabilité : ${(p.prob * 100).toFixed(1)}% • ${pickBadge(p.prob)}`));

          if (p.book) {
            let detail = '🏦 Cote bookmaker';
            if (p.book.bookCount) detail += ` (${p.book.bookCount} books)`;
            if (edge != null) {
              detail += edge > 0.005
                ? ` • Value +${(edge * 100).toFixed(1)}%`
                : ' • pas de value';
            }
            lines.push(style.row(detail));
          } else {
            lines.push(style.row('≈ Cote équitable (bookmaker indisponible)'));
          }
          lines.push(style.blank());
        });

        lines.push(style.title('RÉSUMÉ DU COUPON'));
        lines.push(style.row(`🧮 Cote totale : ${fmtOdds(combinedOdds)}`));
        lines.push(style.row(`🎯 Probabilité que tout passe : ${(combinedProb * 100).toFixed(1)}%`));
        lines.push(style.row(`🛡️ Sécurité : ${risk}`));
        lines.push(style.row(`💵 Mise totale : ${fmtMoney(opts.stake)} FCFA`));
        lines.push(style.row(`🏆 Gain potentiel : ${fmtMoney(potential)} FCFA`));
        lines.push(style.row(`📈 Bénéfice net : ${fmtMoney(potential - opts.stake)} FCFA`));
        lines.push(style.blank());
        lines.push(style.row('⚠️ Pronostic statistique, aucune garantie.'));
        lines.push(style.row('Conseil : 2 à 5% du budget maximum.'));
        lines.push(style.row('Ne mise que ce que tu peux perdre. 18+.'));
        lines.push(style.row('Sources : TipsAudit + SportMonks/Infersports.'));
        lines.push(style.row('🏦 = cote bookmaker • ≈ = cote équitable'));
        lines.push(style.row('.promo ticket 5 2000 (plus risqué) | .promo ticket safe'));
        lines.push(style.row('.promo ticket live [n] [mise]'));
        lines.push(style.frameFooter());

        return sock.sendMessage(from, { text: lines.join('\n') }, { quoted: m });
      }

      let filtered = matches;
      let showAll = false;
      let page = 1;

      if (sub === 'all' || sub === 'tout' || sub === 'tous') {
        showAll = true;
      } else if (sub === 'live' || sub === 'encours' || sub === 'en-cours' || sub === 'direct') {
        const liveToday = matches.filter(x => x.live && x.live.started && !x.live.finished);
        if (liveToday.length) {
          const slice = liveToday.slice(0, PAGE_SIZE);
          const text = [
            style.frameHeader('LIVE FOOT + PRONOS'),
            style.row(`🔴 ${liveToday.length} match(s) en cours • ${tz}`),
            style.blank(),
            ...renderLiveWithTips(slice, tz),
            style.row('Scores live : SportMonks / FotMob'),
            style.row('🎯 Pronostic pré-match • ⚠️ à vérifier selon le score'),
            style.row('.promo ticket live [n] [mise]'),
            style.frameFooter()
          ].join('\n');
          return sock.sendMessage(from, { text }, { quoted: m });
        }

        const live = await getLiveMatches();
        if (!live.length) {
          return sock.sendMessage(from, { text: style.renderInfo(['Aucun match en cours pour le moment.']) }, { quoted: m });
        }
        const text = [
          style.frameHeader('LIVE FOOT'),
          style.row(`🔴 ${live.length} match(s) en cours • ${tz}`),
          style.blank(),
          ...renderLive(live),
          style.row('Scores en direct : SportMonks / FotMob'),
          style.row('.promo ticket live [n] [mise]'),
          style.frameFooter()
        ].join('\n');
        return sock.sendMessage(from, { text }, { quoted: m });
      } else if (sub === 'value' || sub === 'values' || sub === 'vb') {
        filtered = matches.filter(x => x.value);
        if (!filtered.length) {
          return sock.sendMessage(from, { text: style.renderInfo(['Aucun value bet détecté pour le moment.', 'Reviens plus tard ou tape .promo all.']) }, { quoted: m });
        }
      } else if (/^\d+$/.test(sub)) {
        page = Math.max(1, parseInt(sub, 10));
      } else if (a.length) {
        const q = a.join(' ').toLowerCase();
        filtered = matches.filter(x =>
          x.league.toLowerCase().includes(q) ||
          x.home.toLowerCase().includes(q) ||
          x.away.toLowerCase().includes(q)
        );
        if (!filtered.length) {
          return sock.sendMessage(from, { text: style.renderInfo([`Aucun match trouvé pour « ${a.join(' ')} ».`, 'Essaie .promo all pour tout voir.']) }, { quoted: m });
        }
      }

      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > pages) page = pages;
      const pageMatches = showAll ? filtered : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      await enrichWithRealOdds(pageMatches);

      const lines = [
        style.frameHeader('PRONOS DU JOUR'),
        style.row(`📅 ${dateLabel} • ${total} match(s)`),
        style.row(`🕒 Heures : ${tz}`),
        style.blank(),
        ...(fallback ? [style.row('⚠️ Cotes momentanément indisponibles'), style.blank()] : []),
        ...renderMatches(pageMatches, tz)
      ];

      if (!showAll && pages > 1) {
        lines.push(style.row(`Page ${page}/${pages} • .promo ${page < pages ? page + 1 : 1} pour ${page < pages ? 'la suite' : 'revenir au début'}`));
        lines.push(style.blank());
      }

      if (fallback) {
        lines.push(style.row('Source matchs/scores : FotMob'));
      } else {
        lines.push(style.row('Cotes réelles : Crown, Sbobet, Macau, M8bet, Nova88, HKJC'));
        lines.push(style.row('Pronos/probas : TipsAudit (tipsaudit.com)'));
        lines.push(style.row('Scores : FotMob'));
      }
      lines.push(style.row('🏦 = cotes bookmakers • ≈ = cotes équitables'));
      lines.push(style.row('1 = domicile • X = nul • 2 = extérieur • 💎 = value bet'));
      lines.push(style.row('.promo ticket [n] [mise] • .promo ticket safe'));
      lines.push(style.row('.promo all | .promo live | .promo books | .promo value'));
      lines.push(style.row('.promo compare <équipe> <1> <X> <2>'));
      lines.push(style.frameFooter());

      await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: m });
    } catch (e) {
      console.error('[PROMO]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur promo : ' + (e.message || 'inconnue')]) }, { quoted: m });
    }
  }
};
