'use strict';
const style = require('../../config/style');
const db = require('../../lib/database');

function scheduleReminder(sock, reminder) {
  const delay = Math.max(0, (reminder.dueAt || 0) - Date.now());
  setTimeout(async () => {
    try {
      const reminders = db.getSetting('reminders', []).filter(r => r.id !== reminder.id);
      db.setSetting('reminders', reminders);
      await sock.sendMessage(reminder.from, { text: `🔔 RAPPEL : ${reminder.message}` });
    } catch (e) {}
  }, delay);
}

module.exports = {
  name: 'remind',
  aliases: ['rappel'],
  category: 'divers',
  description: "Programme un rappel persistant (ex: .remind 10m Boire de l'eau)",
  scheduleReminder,
  async execute(sock, m, from, args) {
    const timeStr = args[0];
    const message = args.slice(1).join(' ').trim();
    if (!timeStr || !message) return sock.sendMessage(from, { text: style.renderInfo(['Usage : .remind <temps> <message> (ex: 10m)']) });

    const match = String(timeStr).match(/^(\d+)([smh])$/i);
    if (!match) return sock.sendMessage(from, { text: style.renderError(['Format de temps invalide (ex: 10m, 30s, 1h)']) });

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    let ms = 0;
    if (unit === 's') ms = value * 1000;
    if (unit === 'm') ms = value * 60 * 1000;
    if (unit === 'h') ms = value * 60 * 60 * 1000;
    if (ms <= 0) return sock.sendMessage(from, { text: style.renderError(['Durée invalide.']) });

    const reminder = { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, from, message, dueAt: Date.now() + ms };
    const reminders = db.getSetting('reminders', []);
    reminders.push(reminder);
    db.setSetting('reminders', reminders);
    scheduleReminder(sock, reminder);

    await sock.sendMessage(from, { text: style.renderSuccess([`Rappel programmé dans ${value}${unit}.`]) });
  }
};
