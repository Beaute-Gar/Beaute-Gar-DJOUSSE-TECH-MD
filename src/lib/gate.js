'use strict';

// Décision centrale des permissions (gate)
// Détermine si une commande peut s'exécuter en fonction du mode, des permissions, etc.

function gate({ mode, isOwner, isGroup, isAdmin, isBotAdmin, cmd }) {
  // Par défaut : accepter
  let action = 'execute';
  let reason = '';

  // 1. Vérification ownerOnly
  if (cmd.ownerOnly && !isOwner) {
    action = 'deny';
    reason = 'ownerOnly';
  }

  // 2. Vérification adminOnly (groupe + admin du groupe)
  if (cmd.adminOnly && isGroup && !isAdmin) {
    action = 'deny';
    reason = 'adminOnly';
  }

  // 3. Vérification botAdmin (le bot doit être admin du groupe)
  if (cmd.botAdmin && isGroup && !isBotAdmin) {
    action = 'deny';
    reason = 'botAdmin';
  }

  // 4. Vérification groupOnly (uniquement en groupe)
  if (cmd.groupOnly && !isGroup) {
    action = 'deny';
    reason = 'groupOnly';
  }

  // 5. Vérification privateOnly (uniquement en privé)
  if (cmd.privateOnly && isGroup) {
    action = 'deny';
    reason = 'privateOnly';
  }

  // 6. Mode .self : si la session est en .self et ce n'est pas le propriétaire,
  // on ignore (sauf si c'est ownerOnly qui a déjà été vérifié ci-dessus)
  if (mode === 'self' && !isOwner && action !== 'deny') {
    action = 'ignore';
    reason = 'selfMode';
  }

  return { action, reason };
}

function deniedText(reason, number) {
  const messages = {
    ownerOnly: `⛔ Cette commande est réservée au propriétaire du bot.`,
    adminOnly: `⛔ Cette commande est réservée aux administrateurs du groupe.`,
    botAdmin: `⛔ Le bot doit être administrateur du groupe pour cette commande.`,
    groupOnly: `⛔ Cette commande ne fonctionne que dans un groupe.`,
    privateOnly: `⛔ Cette commande ne fonctionne qu'en conversation privée.`,
    selfMode: `🔇 Cette session est en mode .self, elle ignore les commandes des autres.`,
    unknown: `⛔ Accès refusé à cette commande.`
  };
  return messages[reason] || messages.unknown;
}

module.exports = { gate, deniedText };