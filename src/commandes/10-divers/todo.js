'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

module.exports = {
  name: 'todo',
  category: 'divers',
  description: 'Gere une liste de taches (add/list/del)',
  async execute(sock, m, from, args) {
    const action = args[0]?.toLowerCase();
    const sender = m.key.participant || from;
    const todos = db.getSetting(`todo_${sender}`, []);

    if (action === 'add') {
      const task = args.slice(1).join(' ');
      if (!task) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .todo add <tache>']) });
      todos.push(task);
      db.setSetting(`todo_${sender}`, todos);
      return sock.sendMessage(from, { text: style.renderSuccess(['Tache ajoutee.']) });
    }

    if (action === 'list') {
      if (todos.length === 0) return sock.sendMessage(from, { text: style.renderInfo(['Aucune tache.']) });
      const list = todos.map((t, i) => `${i + 1}. ${t}`).join('\n');
      return sock.sendMessage(from, { text: style.box('TODO', [list]) });
    }

    if (action === 'del') {
      const index = parseInt(args[1]) - 1;
      if (isNaN(index) || index < 0 || index >= todos.length) {
        return sock.sendMessage(from, { text: style.renderError(['Index invalide.']) });
      }
      todos.splice(index, 1);
      db.setSetting(`todo_${sender}`, todos);
      return sock.sendMessage(from, { text: style.renderSuccess(['Tache supprimee.']) });
    }

    await sock.sendMessage(from, { text: style.renderInfo(['Usage : .todo add/list/del <tache>']) });
  }
};
