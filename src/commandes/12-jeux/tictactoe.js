'use strict';
const style = require('../../config/style');

const games = new Map();

function render(board) {
  const c = (v) => v || ' ';
  return [
    `${c(board[0])} | ${c(board[1])} | ${c(board[2])}`,
    '---------',
    `${c(board[3])} | ${c(board[4])} | ${c(board[5])}`,
    '---------',
    `${c(board[6])} | ${c(board[7])} | ${c(board[8])}`
  ].join('\n');
}

function checkWin(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,cc,d] of lines) {
    if (b[a] && b[a] === b[cc] && b[a] === b[d]) return b[a];
  }
  if (b.every((x) => x)) return 'draw';
  return null;
}

module.exports = {
  name: 'tictactoe',
  aliases: ['ttt', 'morpion'],
  category: 'jeux',
  description: 'Morpion a 2 joueurs. Usage : .ttt @joueur',
  async execute(sock, m, from, args) {
    try {
      if (games.has(from)) {
        const g = games.get(from);
        const move = parseInt(args[0], 10);
        if (!isNaN(move) && move >= 1 && move <= 9) {
          const idx = move - 1;
          const player = g.turn === 'X' ? 'X' : 'O';
          if (g.board[idx]) {
            return sock.sendMessage(from, { text: style.renderError(['Case deja prise.']) }, { quoted: m });
          }
          g.board[idx] = player;
          const res = checkWin(g.board);
          if (res) {
            games.delete(from);
            const msg = res === 'draw' ? 'Match nul !' : `Victoire de ${res} !`;
            return sock.sendMessage(from, { text: style.renderSuccess([msg, render(g.board)]) }, { quoted: m });
          }
          g.turn = g.turn === 'X' ? 'O' : 'X';
          return sock.sendMessage(from, { text: style.renderInfo([`Tour de ${g.turn}`, render(g.board)]) }, { quoted: m });
        }
        return sock.sendMessage(from, { text: style.renderInfo(['Morpion en cours.', `Tour de ${g.turn}`, render(g.board), 'Joue avec .ttt <1-9>']) }, { quoted: m });
      }

      // nouveau jeu
      const opponent = (m.message?.extendedTextMessage?.contextInfo?.mentionedJid || [])[0];
      if (!opponent) {
        return sock.sendMessage(from, { text: style.renderInfo(['Usage : .ttt @joueur pour demarrer', 'Puis .ttt <1-9> pour jouer']) }, { quoted: m });
      }
      games.set(from, { board: Array(9).fill(null), turn: 'X', players: [m.key.participant || m.key.remoteJid, opponent] });
      await sock.sendMessage(from, { text: style.renderInfo(['Morpion demarre !', 'X commence.', render(Array(9).fill(null)), 'Joue avec .ttt <1-9>']) }, { quoted: m });
    } catch (e) {
      console.error('[TTT]', e.message);
      await sock.sendMessage(from, { text: style.renderError(['Erreur : ' + e.message]) }, { quoted: m });
    }
  }
};