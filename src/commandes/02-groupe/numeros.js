'use strict';
let style = {};
try { style = require('../../config/style'); } catch (e) { style = {}; }
const store = require('../../lib/numstore');

// Extrait les numeros d'une vCard (contact WhatsApp partage)
function phonesFromVcard(vcard) {
  const out = [];
  if (typeof vcard !== 'string') return out;
  const matches = vcard.match(/TEL[^:]*:([^\r\n]+)/gi) || [];
  for (const m of matches) {
    const num = m.split(':').slice(1).join(':').replace(/[^\d+]/g, '');
    const cleaned = store.clean(num);
    if (cleaned) out.push(cleaned);
  }
  // fallback : tout bloc de 8-15 chiffres
  const all = vcard.match(/\d{8,15}/g) || [];
  for (const d of all) {
    const c = store.clean(d);
    if (c) out.push(c);
  }
  return out;
}

// Extrait les numeros d'un message (contact, contactsArray, ou texte)
function collectFromMessage(msg) {
  const out = [];
  if (!msg) return out;
  const m = msg.message || msg;
  if (!m) return out;

  // contactMessage
  if (m.contactMessage && m.contactMessage.vcard) {
    out.push(...phonesFromVcard(m.contactMessage.vcard));
  }
  // contactsArrayMessage
  if (m.contactsArrayMessage && Array.isArray(m.contactsArrayMessage.contacts)) {
    for (const c of m.contactsArrayMessage.contacts) {
      if (c.vcard) out.push(...phonesFromVcard(c.vcard));
    }
  }
  // quoted message
  const quoted = m.extendedTextMessage && m.extendedTextMessage.contextInfo && m.extendedTextMessage.contextInfo.quotedMessage;
  if (quoted) out.push(...collectFromMessage({ message: quoted }));

  // texte : numeros de 8 a 15 chiffres
  const text = m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || '';
  const nums = String(text).match(/\d{8,15}/g) || [];
  for (const d of nums) {
    const c = store.clean(d);
    if (c) out.push(c);
  }

  return out;
}

module.exports = {
  name: 'num',
  aliases: ['numeros', 'contacts'],
  category: 'groupe',
  description: 'Collecte les numeros (groupe ou discussion) et les memorise. Options : count, clear',
  async execute(sock, m, from, args) {
    const say = (kind, lines) =>
      sock.sendMessage(from, { text: store.reply(style, kind, lines) }, { quoted: m }).catch(() => {});

    try {
      if (!store.isOwner(sock, m)) {
        return say('Error', ['Commande reservee au proprietaire du bot.']);
      }

      const arg = (store.getArgs(m, args)[0] || '').toLowerCase();

      if (arg === 'count') {
        return say('Info', ['Numeros memorises : ' + store.load().length]);
      }
      if (arg === 'clear' || arg === 'reset') {
        store.clear();
        return say('Success', ['Base de numeros videe.']);
      }

      const found = new Map(); // numero -> nom
      let unresolved = 0;
      const me = store.botNumber(sock);

      if (store.isGroupJid(from)) {
        // Collecte depuis les participants du groupe
        const meta = await sock.groupMetadata(from);
        for (const p of meta.participants || []) {
          const n = store.numberOf(p);
          if (!n) { unresolved++; continue; }
          if (n === me) continue;
          found.set(n, p.notify || p.name || 'Inconnu');
        }
        // + contacts partages / texte dans le message
        for (const n of collectFromMessage(m)) {
          if (n !== me && !found.has(n)) found.set(n, 'Contact partage');
        }

        if (found.size === 0) {
          return say('Error', ['Aucun numero exploitable (identifiants masques par WhatsApp).']);
        }

        const numbers = [...found.keys()];
        const { all, added } = store.merge(numbers);

        const content =
          'LISTE DES CONTACTS : ' + (meta.subject || 'groupe') + '\n' +
          'Numeros extraits : ' + numbers.length + '\n' +
          'Nouveaux dans la base : ' + added + '\n' +
          'Total dans la base : ' + all.length + '\n' +
          (unresolved ? 'Ignores (numero masque) : ' + unresolved + '\n' : '') +
          '\n' +
          numbers.map((n) => '+' + n + ' - ' + found.get(n)).join('\n');

        const safeName = String(meta.subject || 'groupe').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'groupe';
        const ownerJid = me + '@s.whatsapp.net';

        try {
          await sock.sendMessage(ownerJid, {
            document: Buffer.from(content, 'utf8'),
            fileName: 'contacts_' + safeName + '.txt',
            mimetype: 'text/plain',
            caption: numbers.length + ' numeros extraits (' + added + ' nouveaux).\nBase totale : ' + all.length + '.'
          });
        } catch (err) {
          console.error('[NUM] Envoi prive impossible :', err && err.message);
          return say('Error', ['Numeros memorises, mais l envoi du fichier en prive a echoue.']);
        }

        return say('Success', ['Fichier envoye en prive. ' + added + ' nouveau(x) numero(s) memorise(s).']);
      }

      // Discussion privee : on memorise le contact de la conversation
      const remote = from; // jid de la discussion
      const num = store.clean(String(remote).split('@')[0]);
      // + contacts partages / texte
      const extra = collectFromMessage(m);
      const toMerge = [];
      if (num && num !== me) { toMerge.push(num); found.set(num, 'Discussion'); }
      for (const n of extra) {
        if (n !== me && !found.has(n)) { found.set(n, 'Contact partage'); toMerge.push(n); }
      }
      if (toMerge.length === 0) {
        return say('Error', ['Aucun numero exploitable dans cette discussion.']);
      }
      const { all, added } = store.merge(toMerge);
      return say('Success', [
        toMerge.length + ' numero(s) memorise(s) depuis la discussion.',
        'Nouveaux : ' + added + ' | Total base : ' + all.length
      ]);
    } catch (err) {
      console.error('[NUM ERROR]', err);
      return say('Error', ['Erreur pendant la collecte : ' + (err && err.message ? err.message : 'inconnue')]);
    }
  }
};