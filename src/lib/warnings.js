'use strict';
const db = require('./database');
function addWarning(groupId, userId, reason = 'Non-respect des regles') {
  const warns = db.getSetting(`warns_${groupId}`, {});
  warns[userId] = (warns[userId] || 0) + 1;
  db.setSetting(`warns_${groupId}`, warns);
  const limit = db.getSetting(`warnlimit_${groupId}`, 3);
  return { count: warns[userId], limit, kicked: warns[userId] >= limit };
}
function resetWarnings(groupId, userId) {
  const warns = db.getSetting(`warns_${groupId}`, {});
  delete warns[userId];
  db.setSetting(`warns_${groupId}`, warns);
}
module.exports = { addWarning, resetWarnings };
