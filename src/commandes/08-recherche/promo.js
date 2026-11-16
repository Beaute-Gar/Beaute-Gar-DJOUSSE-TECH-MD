'use strict';

const style = require('../../config/style');
const {
  getTodayMatches,
  getBetBetterPicks,
  enrichWithRealOdds,
  enrichWithSportmonksOdds,
  timeInTz,
  dateInTz,
  dateLabelInTz,
  norm,
  DEFAULT_TZ
} = require('../../lib/promo');

const COUPON_COUNT = 10;
const MIN_PROB = 0.50;
const MIN_ODDS = 1.50;
const STAKE = Math.max(100, parseInt(process.env.PROMO_STAKE || '1000', 10) || 1000);

const PICK_KEY = { '1': 'home', X: 'draw', '2': 'away' };
const PICK_LABEL = { '1': '1 (Domicile)', X: 'X (Nul)', '2': '2 (Extérieur)' };

function fmtOdds(n) {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v.toFixed(2) : '-';
}

function fmtMoney(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  return new Intl.NumberFormat('fr-FR').format(n).replace(/[\u202f\u00a0]/g, ' ');
}

function fmtPct(value) {
  const p = Number(value);
  if (!Number.isFinite(p)) return '-';
  const pct = p * 100;
  if (pct > 0 && pct < 0.01) return '<0.01%';
  return `${pct.toFixed(2)}%`;
}

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
  const key = PICK_KEY[pick.label] || 'home';
  const markets = [mt.real, mt.sm].filter(Boolean);
  let book = null;

  for (const market of markets) {
    const value = Number(market[key]);
    if (!Number.isFinite(value) || value <= 1) continue;
    if (!book || value > Number(book[key])) book = market;
  }

  const fair = mt.odds ? Number(mt.odds[key]) : NaN;
  if (book) return { odd: Number(book[key]), book };
  if (Number.isFinite(fair) && fair > 1) return { odd: fair, book: null };
  return { odd: null, book: null };
}

function matchKey(c) {
  return `${norm(c.home)}|${norm(c.away)}`;
}

async function getTipCoupons() {
  const { matches } = await getTodayMatches();
  const candidates = matches
    .filter(mt => !(mt.live && (mt.live.cancelled || mt.live.finished)))
    .map(mt => ({ mt, pick: pickFromMatch(mt) }))
    .filter(x => x.pick && x.pick.prob > MIN_PROB)
    .sort((a, b) => b.pick.prob - a.pick.prob)
    .slice(0, 25);

  if (!candidates.length) return [];

  await Promise.all([
    enrichWithRealOdds(candidates.map(c => c.mt)),
    enrichWithSportmonksOdds(candidates.map(c => c.mt))
  ]);

  return candidates
    .map(({ mt, pick }) => {
      const market = marketOddFor(mt, pick);
      if (!Number.isFinite(market.odd) || market.odd <= MIN_ODDS) return null;
      return {
        source: 'TipsAudit',
        league: mt.league,
        home: mt.home,
        away: mt.away,
        kickoff: mt.kickoff,
        market: '1X2',
        pickLabel: PICK_LABEL[pick.label],
        prob: pick.prob,
        odd: market.odd,
        book: market.book,
        edge: market.book ? pick.prob * market.odd - 1 : null
      };
    })
    .filter(Boolean);
}

async function getCoupons() {
  const today = dateInTz(new Date(), 'UTC');
  let coupons = [];
  let betBetterCount = 0;
  let betBetterError = false;

  try {
    const betBetter = await getBetBetterPicks({ limit: COUPON_COUNT });
    coupons = betBetter.filter(c => dateInTz(c.kickoff, 'UTC') === today);
    betBetterCount = coupons.length;
  } catch (_) {
    betBetterError = true;
    coupons = [];
  }

  if (coupons.length < COUPON_COUNT) {
    const tips = await getTipCoupons();
    const seen = new Set(coupons.map(matchKey));

    for (const c of tips) {
      if (coupons.length >= COUPON_COUNT) break;
      const key = matchKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      coupons.push(c);
    }
  }

  coupons = coupons
    .filter(c => Number.isFinite(c.prob) && c.prob > MIN_PROB && Number.isFinite(c.odd) && c.odd > MIN_ODDS)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, COUPON_COUNT);

  return {
    coupons,
    betBetterCount: coupons.filter(c => c.source === 'Bet Better').length,
    betBetterError
  };
}

function sourceText(betBetterCount, betBetterError) {
  if (betBetterCount > 0) {
    return 'Source : Bet Better (betbetter.world) + TipsAudit.';
  }
  if (betBetterError) {
    return 'Source : TipsAudit + cotes bookmakers (Bet Better indisponible).';
  }
  return 'Source : TipsAudit + cotes bookmakers (Bet Better : 0 football aujourd\'hui).';
}

function renderCoupons(coupons, dateLabel, tz, betBetterCount, betBetterError) {
  const totalStake = STAKE * coupons.length;
  const totalReturn = coupons.reduce((sum, c) => sum + STAKE * c.odd, 0);
  const allProb = coupons.reduce((prob, c) => prob * c.prob, 1);
  const expectedWins = coupons.reduce((sum, c) => sum + c.prob, 0);

  const lines = [
    style.frameHeader('COUPONS VALIDES'),
    style.row(`📅 ${dateLabel} • ${tz}`),
    style.row(`🎟️ ${coupons.length} coupons séparés • ${fmtMoney(STAKE)} FCFA / coupon`),
    style.row('✅ Filtre : probabilité > 50% • cote > 1.50'),
    style.blank()
  ];

  coupons.forEach((c, index) => {
    const time = timeInTz(c.kickoff, tz);
    lines.push(style.title(`${index + 1}. ${c.league}`));
    lines.push(style.row(`${time}  ${c.home} vs ${c.away}`));
    lines.push(style.row(`🎯 ${c.pickLabel} @ ${c.book ? '🏦' : '≈'}${fmtOdds(c.odd)}`));
    lines.push(style.row(`📊 Probabilité : ${(c.prob * 100).toFixed(1)}% • ✅ VALIDE`));

    if (c.book) {
      let detail = '🏦 Cote bookmaker';
      if (c.book.bookCount) detail += ` (${c.book.bookCount} books)`;
      if (Number.isFinite(c.edge) && c.edge > 0.005) {
        detail += ` • 💎 Value +${(c.edge * 100).toFixed(1)}%`;
      }
      lines.push(style.row(detail));
    } else {
      lines.push(style.row(c.source === 'Bet Better' ? '≈ Cote juste Bet Better' : '≈ Cote équitable'));
    }

    lines.push(style.row(`💵 Gain potentiel : ${fmtMoney(STAKE * c.odd)} FCFA`));
    lines.push(style.blank());
  });

  lines.push(style.title('RÉSUMÉ'));
  lines.push(style.row(`🎟️ ${coupons.length} coupons • mise totale ${fmtMoney(totalStake)} FCFA`));
  lines.push(style.row(`🏆 Retour max : ${fmtMoney(totalReturn)} FCFA`));
  lines.push(style.row(`📈 Bénéfice max : ${fmtMoney(totalReturn - totalStake)} FCFA`));
  lines.push(style.row(`🎯 Probabilité que les ${coupons.length} passent : ${fmtPct(allProb)}`));
  lines.push(style.row(`📊 Victoires attendues : ~${expectedWins.toFixed(1)}/${coupons.length}`));
  lines.push(style.blank());
  lines.push(style.row('⚠️ "Valide" = critères respectés, pas une garantie.'));
  lines.push(style.row('⚠️ Coupons séparés, pas un combiné unique.'));
  lines.push(style.row('💡 >50% de probabilité ⇒ cote <2.00.'));
  lines.push(style.row('Ne mise que ce que tu peux perdre. 18+.'));
  lines.push(style.row(sourceText(betBetterCount, betBetterError)));
  lines.push(style.frameFooter());

  return lines.join('\n');
}

module.exports = {
  name: 'promo',
  aliases: ['pronostic', 'pronostics', 'prono', 'pronos', 'tips', 'cotes', 'odds'],
  category: 'recherche',
  description: '10 coupons football valides : probabilité > 50% et cote > 1.50',
  async execute(sock, m, from) {
    try {
      await sock.sendMessage(from, {
        text: style.renderInfo(['Recherche des 10 coupons valides (probabilité > 50%, cote > 1.50)...'])
      }, { quoted: m });

      const { coupons, betBetterCount, betBetterError } = await getCoupons();

      if (!coupons.length) {
        return sock.sendMessage(from, {
          text: style.renderInfo([
            'Aucun coupon ne respecte les critères (>50% et cote >1.50) pour le moment.',
            'Réessaie plus tard.'
          ])
        }, { quoted: m });
      }

      const text = renderCoupons(
        coupons,
        dateLabelInTz(new Date(), DEFAULT_TZ),
        DEFAULT_TZ,
        betBetterCount,
        betBetterError
      );

      return sock.sendMessage(from, { text }, { quoted: m });
    } catch (e) {
      console.error('[PROMO]', e.message);
      await sock.sendMessage(from, {
        text: style.renderError(['Erreur promo : ' + (e.message || 'inconnue')])
      }, { quoted: m });
    }
  }
};
