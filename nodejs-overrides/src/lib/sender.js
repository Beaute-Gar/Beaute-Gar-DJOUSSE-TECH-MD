'use strict';

const resolveSender = (sock, msg) => {
  const fromMe = !!msg.key.fromMe;
  const participant = msg.key.participant || msg.key.remoteJid;
  const jid = participant || msg.key.remoteJid;
  const number = jid ? String(jid).split('@')[0].replace(/\D/g, '') : '';
  const chatJid = msg.key.remoteJid;
  const isGroup = chatJid && chatJid.endsWith('@g.us');
  const ids = [jid, number].filter(Boolean);
  
  return {
    jid,
    number,
    chatJid,
    isGroup,
    isFromMe: fromMe,
    ids,
    isOwner: false,
    isBotAdmin: false,
    isAdmin: false
  };
};

const botIdentities = (sock) => {
  const id = sock.user && sock.user.id ? String(sock.user.id) : '';
  return [id];
};

module.exports = { resolveSender, botIdentities };