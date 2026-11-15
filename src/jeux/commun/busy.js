'use strict';

// Groupes dont un jeu modifie temporairement les réglages (le mode nuit automatique s'efface alors)
const set = new Set();
module.exports = {
  mark: (chatId) => set.add(chatId),
  unmark: (chatId) => set.delete(chatId),
  isBusy: (chatId) => set.has(chatId)
};
