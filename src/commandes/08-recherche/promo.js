'use strict';

const style = require('../../config/style');
const { getTodayMatches, getLiveMatches, enrichWithRealOdds, getBookmakerMatches, enrichBookmakerMatches, getSharpLineByQuery, timeInTz, DEFAULT_TZ } = require('../../lib/promo');

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
  description: 'Pronostics et cotes des matchs de football du jour',
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

      let filtered = matches;
      let showAll = false;
      let page = 1;

      if (sub === 'all' || sub === 'tout' || sub === 'tous') {
        showAll = true;
      } else if (sub === 'live' || sub === 'encours' || sub === 'en-cours' || sub === 'direct') {
        const live = await getLiveMatches();
        if (!live.length) {
          return sock.sendMessage(from, { text: style.renderInfo(['Aucun match en cours pour le moment.']) }, { quoted: m });
        }
        const text = [
          style.frameHeader('LIVE FOOT'),
          style.row(`🔴 ${live.length} match(s) en cours • ${tz}`),
          style.blank(),
          ...renderLive(live),
          style.row('Scores en direct : FotMob'),
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
