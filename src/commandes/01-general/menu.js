'use strict';
const style = require('../../config/style');
const config = require('../../config/config');
const db = require('../../lib/database');
const cmdHandler = require('../../handlers/command-handler');
const path = require('path');
const fs = require('fs');

const CATEGORY_EMOJIS = {
  general: '⚙️ GENERAL', groupe: '👥 GROUPE', protection: '🛡️ PROTECTION',
  'sticker-media': '🎨 STICKER & MEDIA', outils: '🛠️ OUTILS', ia: '🧠 INTELLIGENCE IA',
  fun: '🎮 DIVERTISSEMENT', recherche: '🔍 RECHERCHE', owner: '👑 OWNER',
  divers: '📦 DIVERS', telechargement: '📥 TELECHARGEMENT', jeux: '🎲 JEUX'
};

module.exports = {
  name: 'menu',
  aliases: ['help', 'aide'],
  category: 'general',
  description: 'Affiche le menu des commandes',
  async execute(sock, m, from) {
    const currentMode = db.getSetting('mode') || 'public';
    const ownerName = 'ʙᴇᴀᴜᴛᴇɢᴀʀ';

    let menuText = `╭┄┄『 MENU DU BOT 』┄❍\n│\n`;
    menuText += `│✦ Nom : ${config.botName}\n`;
    menuText += `│✦ Prefix : ${config.prefix}\n`;
    menuText += `│✦ Commandes : ${cmdHandler.commands.size}\n`;
    menuText += `│✦ Mode : ${currentMode === 'self' ? 'Privé 🔴' : 'Public 🟢'}\n`;
    menuText += `│\n`;
    menuText += `│「 INFORMATIONS 」\n`;
    menuText += `│✦ Owner : ${ownerName}\n`;
    menuText += `│\n`;

    const sortedCats = [...cmdHandler.byCategory.keys()].sort();
    for (const cat of sortedCats) {
      const list = cmdHandler.byCategory.get(cat).sort((a, b) => a.name.localeCompare(b.name));
      if (list.length === 0) continue;
      
      const catName = CATEGORY_EMOJIS[cat] || cat.toUpperCase();
      
      menuText += `│「 ${catName} 」 ⟨ ${list.length} ⟩\n`;
      for (const c of list) {
        menuText += `│  ✦ ${config.prefix}${c.name}\n`;
      }
      menuText += `│\n`;
    }

    menuText += `╰┄┄┄┄┄┄┄┄┄┄┄┄⪼`;

    const imgPath = path.join(__dirname, '../../../logo.jpg');
    if (fs.existsSync(imgPath)) {
      await sock.sendMessage(from, { 
        image: fs.readFileSync(imgPath), 
        caption: menuText 
      }, { quoted: m });
    } else {
      await sock.sendMessage(from, { text: menuText }, { quoted: m });
    }
  }
};