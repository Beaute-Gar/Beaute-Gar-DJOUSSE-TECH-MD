'use strict';

const claimed = new Map();
const TTL = 120_000;

const claim = (chatJid, msgId, sessionId) => {
  const key = `${chatJid}:${msgId}`;
  const now = Date.now();
  
  // Clean expired
  for (const [k, v] of claimed.entries()) {
    if (now - v.time > TTL) claimed.delete(k);
  }
  
  if (claimed.has(key)) return false;
  claimed.set(key, { sessionId, time: now });
  return true;
};

const sessionOwning = (ids) => {
  // No multi-session ownership tracking in this minimal version
  return null;
};

const registerSession = (sessionId) => {};
const unregisterSession = (sessionId) => {};

module.exports = { claim, sessionOwning, registerSession, unregisterSession };