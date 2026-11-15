'use strict';
const style = require('../../config/style');
const axios = require('axios');

const BASE = 'https://www.thesportsdb.com/api/v1/json/123';
const LEAGUES = {
  pl: 4328, premier: 4328, epl: 4328,
  laliga: 4335, liga: 4335, spain: 4335,
  seriea: 4332, serie: 4332, italy: 4332,
  bundesliga: 4331, bundes: 4331, germany: 4331,
  ligue1: 4334, france: 4334
};

module.exports = {
  name: 'football',
  aliases: ['foot', 'soccer', 'match'],
  category: 'recherche',
  description: 'Infos football (equipe, prochain/dernier match, classement). Usage : .football <equipe> | .football classement <ligue>',
  async execute(sock, m, from, args) {
    try {
      const sub = (args && args[0]) ? args[0].toLowerCase() : '';
      if (sub === 'matchs' || sub === 'matches' || sub === 'today' || sub === 'resultats' || sub === 'scores') {
        const today = new Date().toISOString().slice(0, 10);
        const res = await axios.get(BASE + '/eventsday.php?d=' + today + '&s=Soccer', { timeout: 15000 });
        const events = res.data && res.data.events;
        if (!events || events.length === 0) throw new Error('Aucun match aujourd\'hui.');
        const lines = ['Matchs du jour (' + today + ')', ''];
        events.slice(0, 15).forEach((e) => {
          const score = (e.intHomeScore != null && e.intAwayScore != null) ? (e.intHomeScore + ' - ' + e.intAwayScore) : 'vs';
          lines.push(e.strEvent + ' : ' + score);
        });
        return sock.sendMessage(from, { text: style.renderInfo(lines) }, { quoted: m });
      }
      if (sub === 'classement' || sub === 'standings' || sub === 'table') {
        const lg = (args[1] || 'pl').toLowerCase();
        const id = LEAGUES[lg];
        if (!id) return sock.sendMessage(from, { text: style.renderError(['Ligue inconnue. Ligues : pl, laliga, seriea, bundesliga, ligue1']) }, { quoted: m });
        const res = await axios.get(BASE + '/lookuptable.php?l=' + id + '&s=2025-2026', { timeout: 15000 });
        const table = res.data && res.data.table;
        if (!table || table.length === 0) throw new Error('Classement indisponible.');
        const lines = ['Classement (top ' + table.length + ')', ''];
        table.forEach((r) => {
          lines.push(r.intRank + '. ' + r.strTeam + ' - ' + r.intPoints + ' pts (' + r.intWin + 'V ' + r.intDraw + 'N ' + r.intLoss + 'D)');
        });
        return sock.sendMessage(from, { text: style.renderInfo(lines) }, { quoted: m });
      }

      const query = (args || []).join(' ').trim();
      if (!query) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .football <equipe>', 'Ex : .football Arsenal', '.football classement pl']) }, { quoted: m });

      if (!global._footballTeamCache) global._footballTeamCache = new Map();
      let team = global._footballTeamCache.get(query.toLowerCase());
      if (!team) {
        const res = await axios.get(BASE + '/searchteams.php?t=' + encodeURIComponent(query), { timeout: 15000 });
        team = res.data && res.data.teams && res.data.teams[0];
        if (!team) throw new Error('Equipe introuvable.');
        global._footballTeamCache.set(query.toLowerCase(), team);
      }

      const id = team.idTeam;
      let nextTxt = 'Aucun match a venir.';
      let lastTxt = 'Aucun resultat recent.';
      const [nRes, lRes] = await Promise.allSettled([
        axios.get(BASE + '/eventsnext.php?id=' + id, { timeout: 15000 }),
        axios.get(BASE + '/eventslast.php?id=' + id, { timeout: 15000 })
      ]);
      if (nRes.status === 'fulfilled') {
        const ev = nRes.value.data && nRes.value.data.events && nRes.value.data.events[0];
        if (ev) nextTxt = ev.strEvent + ' - ' + ev.dateEvent + ' ' + (ev.strTime || '');
      }
      if (lRes.status === 'fulfilled') {
        const ev = lRes.value.data && lRes.value.data.results && lRes.value.data.results[0];
        if (ev) lastTxt = ev.strEvent + ' : ' + ev.intHomeScore + ' - ' + ev.intAwayScore;
      }

      const lines = [
        team.strTeam,
        'Pays : ' + (team.strCountry || '?'),
        'Stade : ' + (team.strStadium || '?'),
        'Fonde : ' + (team.intFormedYear || '?'),
        '',
        'Dernier match : ' + lastTxt,
        'Prochain match : ' + nextTxt
      ];
      await sock.sendMessage(from, { text: style.renderInfo(lines) }, { quoted: m });
    } catch (e) {
      console.error('[FOOTBALL]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur football : ' + e.message]) }, { quoted: m });
    }
  }
};