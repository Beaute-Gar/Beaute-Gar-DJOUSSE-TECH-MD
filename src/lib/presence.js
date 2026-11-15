'use strict';
// Gestion de la presence (online, typing, recording)
async function setPresence(sock, jid, type = 'available') {
  try {
    await sock.sendPresenceUpdate(type, jid);
  } catch (e) {
    // Ignore silencieusement
  }
}

module.exports = { setPresence };
