'use strict';
const style = require('../config/style');
const db = require('../lib/database');
const bw = require('../lib/badwords');
const { isGroup, getGroupMeta } = require('../lib/helpers');
const { phoneOf, pretty } = require('../lib/phone');

/* =====================  REGLAGES  ===================== */
const FLOOD_MAX = 7;           // messages
const FLOOD_WINDOW = 5000;     // en 5 secondes
const REPEAT_MAX = 4;          // meme message repete 4 fois
const REPEAT_WINDOW = 20000;   // en 20 secondes
const WARN_COOLDOWN = 4000;    // 1 seul avertissement par rafale

/* =====================  MOTS INTERDITS  ===================== */
const BW_LABELS = {
  grossier: 'grossièreté',
  sexuel: 'contenu sexuel',
  haine: 'discours haineux',
  insultes_legeres: 'insulte',
  menaces: 'menace',
  anglais: 'insulte',
  sigles: 'insulte'
};

// Les insultes légères sont actives par défaut ; désactivables par groupe
// via badwords_light_<jid> = false, ou globalement via BADWORDS_LIGHT=false.
const BW_LIGHT_DEFAULT = String(process.env.BADWORDS_LIGHT || 'true').toLowerCase() !== 'false';

// Catégories à expulsion immédiate. Vide par défaut (avertissements classiques).
// Exemple : BADWORDS_KICK=menaces,haine
const BW_KICK = String(process.env.BADWORDS_KICK || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/* =====================  UTILITAIRES JID (@s.whatsapp.net et @lid)  ===================== */
const num = (jid) => String(jid || '').split('@')[0].split(':')[0];
const same = (a, b) => num(a) !== '' && num(a) === num(b);
const idsOf = (p) => [p.id, p.lid, p.phoneNumber, p.jid].filter(Boolean);

function findMember(meta, jid) {
  return (meta.participants || []).find(p => idsOf(p).some(i => same(i, jid)));
}
function isAdminJid(meta, jid) {
  const p = findMember(meta, jid);
  return !!(p && p.admin);
}
function botIds(sock) {
  return [sock.user && sock.user.id, sock.user && sock.user.lid].filter(Boolean);
}
function isBotJid(sock, jid) {
  return botIds(sock).some(b => same(b, jid));
}
function isBotAdminNow(sock, meta) {
  const ids = botIds(sock);
  return (meta.participants || []).some(p => p.admin && idsOf(p).some(i => ids.some(b => same(b, i))));
}
function aliasNums(meta, jid) {
  const set = new Set([num(jid)]);
  const p = findMember(meta, jid);
  if (p) idsOf(p).forEach(i => set.add(num(i)));
  return set;
}
function isBlacklisted(list, meta, jid) {
  const nums = aliasNums(meta, jid);
  return (list || []).some(b => nums.has(num(b)));
}

/* =====================  MEMOIRES TEMPORAIRES  ===================== */
const floodMap = new Map();
const repeatMap = new Map();
const lastAction = new Map();
const kickedMap = new Map();
const joinSeen = new Map();

function throttled(key, ms) {
  const now = Date.now();
  if (now - (lastAction.get(key) || 0) < ms) return true;
  lastAction.set(key, now);
  return false;
}
function markKicked(group, jid) { kickedMap.set(`${group}:${num(jid)}`, Date.now()); }
function wasKickedByGuard(group, jid) {
  const t = kickedMap.get(`${group}:${num(jid)}`);
  return !!t && Date.now() - t < 30000;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of floodMap) if (!v.length || now - v[v.length - 1] > 60000) floodMap.delete(k);
  for (const [k, v] of repeatMap) if (now - v.first > 120000) repeatMap.delete(k);
  for (const [k, t] of lastAction) if (now - t > 300000) lastAction.delete(k);
  for (const [k, t] of kickedMap) if (now - t > 120000) kickedMap.delete(k);
  for (const [k, t] of joinSeen) if (now - t > 60000) joinSeen.delete(k);
}, 60000).unref();

async function kick(sock, group, jid) {
  markKicked(group, jid);
  await sock.groupParticipantsUpdate(group, [jid], 'remove');
}

/* =====================  LECTURE DU MESSAGE  ===================== */
function unwrap(message) {
  let m = message || {};
  for (let i = 0; i < 5; i++) {
    const inner = m.ephemeralMessage?.message
      || m.viewOnceMessage?.message
      || m.viewOnceMessageV2?.message
      || m.viewOnceMessageV2Extension?.message
      || m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}
function getText(c) {
  return c.conversation
    || c.extendedTextMessage?.text
    || c.imageMessage?.caption
    || c.videoMessage?.caption
    || c.documentMessage?.caption
    || '';
}
function getMentionCount(c) {
  for (const v of Object.values(c)) {
    if (v && typeof v === 'object' && v.contextInfo && Array.isArray(v.contextInfo.mentionedJid)) {
      return new Set(v.contextInfo.mentionedJid).size;
    }
  }
  return 0;
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060-\u206F]/g;
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;
const COMBINING = /[\u0300-\u036F]/g;
const LINK_RE = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+|\b[a-z0-9-]+\.(?:com|net|org|io|me|co|xyz|top|click|link|info|ly|gl|cc|tk|ml|ga|cf|gq|ru|cn|cm|app|dev|fr|ca)\b(?:\/\S*)?/i;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Liste personnalisée du groupe : même normalisation que la liste intégrée
// (accents, majuscules, lettres répétées, leet, lettres espacées).
function hasBadWord(text, words) {
  if (!words || !words.length) return false;
  const t = bw.normalizeText(text);
  return words.some((w) => {
    const word = bw.normalizeText(w);
    if (!word) return false;
    return new RegExp(`(^| )${esc(word)}(?= |$)`).test(t);
  });
}
function isFlood(from, sender) {
  const k = `${from}:${num(sender)}`;
  const now = Date.now();
  const arr = (floodMap.get(k) || []).filter(t => now - t < FLOOD_WINDOW);
  arr.push(now);
  floodMap.set(k, arr);
  return arr.length >= FLOOD_MAX;
}
function isRepeat(from, sender, text) {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return false;
  const k = `${from}:${num(sender)}`;
  const now = Date.now();
  const e = repeatMap.get(k);
  if (e && e.text === t && now - e.first < REPEAT_WINDOW) {
    e.count++;
    return e.count >= REPEAT_MAX;
  }
  repeatMap.set(k, { text: t, first: now, count: 1 });
  return false;
}

/* ─────────────── FILTRES AVANCES ─────────────── */

// Le contextInfo peut etre porte par plusieurs types de contenu.
function getContextInfo(content) {
  for (const v of Object.values(content || {})) {
    if (v && typeof v === 'object' && v.contextInfo) return v.contextInfo;
  }
  return null;
}

// « Transfert » : WhatsApp pose isForwarded (et parfois un forwardingScore).
function isForwarded(content) {
  const ctx = getContextInfo(content);
  return Boolean(ctx && (ctx.isForwarded === true || ctx.forwardingScore > 0));
}

// Structures typiques des messages envoye par un bot / une API.
const BOT_MESSAGE_KEYS = [
  'buttonsMessage',
  'templateMessage',
  'listMessage',
  'interactiveMessage',
  'nativeFlowMessage'
];

function isBotMessage(content) {
  if (!content) return false;
  if (BOT_MESSAGE_KEYS.some((k) => content[k])) return true;

  for (const wrap of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
    const inner = content[wrap] && content[wrap].message;
    if (inner && BOT_MESSAGE_KEYS.some((k) => inner[k])) return true;
  }
  return false;
}

// Invitations aux lives (avec ou sans prefixe de compte).
const LIVE_RE = /instagram\.com\/(?:[^\s/]+\/)?live|tiktok\.com\/(?:@[^\s/]+\/)?live/i;

function isVoiceNote(audio) {
  if (!audio) return false;
  // ptt === true : note vocale. ptt === false : fichier audio classique.
  return audio.ptt !== false;
}

/* =====================  SANCTION  ===================== */
async function applySanction({ sock, from, sender, violation, botAdmin, deleteKey, meta, severe }) {
  // 1. Suppression du message fautif
  if (botAdmin) {
    try { await sock.sendMessage(from, { delete: deleteKey }); } catch (e) { console.error('[GUARD] delete:', e.message); }
  }

  const label = pretty(phoneOf(sock, meta, sender) || sender);

  // 2. Infraction grave (categorie configuree) : expulsion immediate.
  if (severe) {
    if (!botAdmin) {
      await sock.sendMessage(from, {
        text: style.renderError([
          `${label} : ${violation}.`,
          'Infraction grave, mais je ne suis pas admin : expulsion impossible.'
        ]),
        mentions: [sender]
      });
      return;
    }
    try {
      await kick(sock, from, sender);
      await sock.sendMessage(from, {
        text: style.renderError([`${label} expulsé (${violation}).`]),
        mentions: [sender]
      });
    } catch (e) {
      await sock.sendMessage(from, { text: style.renderError([`Expulsion impossible : ${e.message}`]) });
    }
    return;
  }

  // 3. Un seul avertissement par rafale
  if (throttled(`warn:${from}:${num(sender)}`, WARN_COOLDOWN)) return;

  const warns = db.getSetting(`warns_${from}`, {});
  warns[sender] = (warns[sender] || 0) + 1;
  db.setSetting(`warns_${from}`, warns);

  const limit = db.getSetting(`warnlimit_${from}`, 3);

  // 4. Limite atteinte : expulsion
  if (warns[sender] >= limit) {
    if (botAdmin) {
      try {
        await kick(sock, from, sender);
        delete warns[sender];
        db.setSetting(`warns_${from}`, warns);
        await sock.sendMessage(from, {
          text: style.renderError([`${label} expulsé (${limit} avertissements).`, `Dernière infraction : ${violation}`]),
          mentions: [sender]
        });
      } catch (e) {
        await sock.sendMessage(from, { text: style.renderError([`Expulsion impossible : ${e.message}`]) });
      }
    } else if (!throttled(`limit:${from}:${num(sender)}`, 60000)) {
      await sock.sendMessage(from, {
        text: style.renderError([`${label} a atteint ${warns[sender]}/${limit} avertissements.`, 'Je ne suis pas admin : expulsion impossible.']),
        mentions: [sender]
      });
    }
    return;
  }

  // 5. Simple avertissement
  await sock.sendMessage(from, {
    text: style.renderError([`${label} : ${violation}`, `Avertissement ${warns[sender]}/${limit}`]),
    mentions: [sender]
  });

  if (!botAdmin && !throttled(`noadmin:${from}`, 120000)) {
    await sock.sendMessage(from, {
      text: style.renderInfo(['Je ne suis pas admin du groupe.', 'Je ne peux ni supprimer les messages ni expulser. Promouvez-moi admin.'])
    });
  }
}

/* =====================  MESSAGES : retourne true si le message a ete traite  ===================== */
async function handleProtection(sock, m) {
  const from = m.key.remoteJid;
  if (!isGroup(from) || m.key.fromMe) return false;

  const sender = m.key.participant || m.participant;
  if (!sender || isBotJid(sock, sender)) return false;

  const meta = await getGroupMeta(sock, from);
  if (!meta) return false;
  const botAdmin = isBotAdminNow(sock, meta);

  // --- Blacklist : expulsion immediate ---
  const blacklist = db.getSetting(`blacklist_${from}`, []);
  if (isBlacklisted(blacklist, meta, sender)) {
    if (botAdmin) {
      try {
        try { await sock.sendMessage(from, { delete: m.key }); } catch (e) {}
        await kick(sock, from, sender);
        const label = pretty(phoneOf(sock, meta, sender) || sender);
        await sock.sendMessage(from, {
          text: style.renderError([`${label} était dans la blacklist. Expulsé.`]),
          mentions: [sender]
        });
      } catch (e) { console.error('[GUARD] blacklist kick:', e.message); }
    } else if (!throttled(`blnoadmin:${from}`, 120000)) {
      await sock.sendMessage(from, {
        text: style.renderError(['Un membre blackliste ecrit, mais je ne suis pas admin : expulsion impossible.'])
      });
    }
    return true;
  }

  // --- Les admins sont exemptes ---
  if (isAdminJid(meta, sender)) return false;

  const settings = db.getSetting(`protection_${from}`, {});
  if (!Object.values(settings).some(Boolean)) return false;

  // --- Lecture du contenu (messages enveloppes et modifies inclus) ---
  const outer = unwrap(m.message);
  const edit = outer.protocolMessage && outer.protocolMessage.editedMessage;
  const content = edit ? unwrap(edit) : outer;
  const deleteKey = (edit && outer.protocolMessage.key)
    ? { ...outer.protocolMessage.key, remoteJid: from, participant: sender }
    : m.key;

  const raw = getText(content);
  const text = raw.replace(ZERO_WIDTH, '');

  // --- Detection (la premiere violation trouvee est retenue) ---
  let violation = null;
  let severe = false;

  if (!violation && settings.antilink && LINK_RE.test(text)) violation = 'Lien interdit';

  if (!violation && settings.antiflood && isFlood(from, sender)) violation = 'Flood detecte';

  if (!violation && settings.antispam && isRepeat(from, sender, text)) violation = 'Spam detecte (message repete)';

  if (!violation && settings.antimedia
    && (content.imageMessage || content.videoMessage || content.audioMessage || content.documentMessage || content.ptvMessage)) {
    violation = 'Media interdit';
  }

  if (!violation && settings.antisticker && content.stickerMessage) violation = 'Sticker interdit';

  if (!violation && settings.antitag && getMentionCount(content) > (settings.taglimit || 5)) {
    violation = 'Mention massive interdite';
  }

  if (!violation && settings.antivirtex) {
    const zw = (raw.match(ZERO_WIDTH) || []).length;
    const bidi = (raw.match(BIDI) || []).length;
    const comb = (raw.match(COMBINING) || []).length;
    if (zw >= 15 || bidi >= 10 || comb >= 40 || raw.length > 6000) violation = 'Contenu suspect (virtex)';
  }

  if (!violation && settings.antibadword) {
    // 1) Liste personnalisee du groupe (reglage badwords_<jid>).
    const custom = db.getSetting(`badwords_${from}`, []);
    if (hasBadWord(text, custom)) {
      violation = 'Mot interdit';
      severe = BW_KICK.includes('custom');
    } else {
      // 2) Liste integree (407 entrees, 7 categories).
      const lightOn = db.getSetting(`badwords_light_${from}`, BW_LIGHT_DEFAULT) !== false;
      const hit = bw.check(text, lightOn ? undefined : { skip: ['insultes_legeres'] });
      if (hit) {
        violation = `Mot interdit (${BW_LABELS[hit.category] || hit.category})`;
        severe = BW_KICK.includes(hit.category);
      }
    }
  }

  // --- FILTRES AVANCES ---
  if (!violation && settings.antivoice && isVoiceNote(content.audioMessage)) {
    violation = 'Note vocale interdite';
  }

  if (!violation && settings.antipoll
    && (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3)) {
    violation = 'Sondage interdit';
  }

  if (!violation && settings.anticontact
    && (content.contactMessage || content.contactsArrayMessage)) {
    violation = 'Partage de contact interdit';
  }

  if (!violation && settings.antiforward && isForwarded(content)) {
    violation = 'Message transfere interdit';
  }

  if (!violation && settings.antistatus
    && (content.groupStatusMessage || content.groupStatusMessageV2)) {
    violation = 'Statut de groupe interdit';
  }

  if (!violation && settings.antibot && isBotMessage(content)) {
    violation = 'Message de bot interdit';
  }

  if (!violation && settings.antidocument && content.documentMessage) {
    violation = 'Document interdit';
  }

  if (!violation && settings.antilive && LIVE_RE.test(text)) {
    violation = 'Invitation live interdite';
  }
  // --- FIN FILTRES AVANCES ---

  if (!violation) return false;

  await applySanction({ sock, from, sender, violation, botAdmin, deleteKey, meta, severe });
  return true;
}

/* =====================  ARRIVEE D'UN MEMBRE : retourne la liste des jids expulses  ===================== */
async function handleGroupJoin(sock, update) {
  const { id, participants, action } = update;
  const expelled = [];
  if (action !== 'add' || !isGroup(id)) return expelled;

  const blacklist = db.getSetting(`blacklist_${id}`, []);
  if (!blacklist.length) return expelled;

  const meta = await getGroupMeta(sock, id);
  if (!meta) return expelled;
  const botAdmin = isBotAdminNow(sock, meta);

  for (const p of participants || []) {
    const jid = typeof p === 'string' ? p : p.id;
    if (!jid) continue;

    const candidates = typeof p === 'string' ? [p] : idsOf(p);
    const banned = candidates.some(c => isBlacklisted(blacklist, meta, c));
    if (!banned) continue;

    // anti-doublon si l'evenement est traite deux fois
    const key = `${id}:${num(jid)}`;
    if (joinSeen.has(key) && Date.now() - joinSeen.get(key) < 15000) { expelled.push(jid); continue; }
    joinSeen.set(key, Date.now());

    const label = pretty(phoneOf(sock, meta, jid, (typeof p !== 'string' ? p.phoneNumber : null), (typeof p !== 'string' ? p.pn : null), (typeof p !== 'string' ? p.lid : null)) || jid);
    if (botAdmin) {
      try {
        await kick(sock, id, jid);
        expelled.push(jid);
        await sock.sendMessage(id, {
          text: style.renderError([`${label} est blacklisté. Expulsion.`]),
          mentions: [jid]
        });
      } catch (e) { console.error('[GUARD] join kick:', e.message); }
    } else if (!throttled(`joinnoadmin:${id}`, 120000)) {
      await sock.sendMessage(id, {
        text: style.renderError([`${label} est blacklisté mais je ne suis pas admin : expulsion impossible.`]),
        mentions: [jid]
      });
    }
  }
  return expelled;
}

module.exports = { handleProtection, handleGroupJoin, wasKickedByGuard };