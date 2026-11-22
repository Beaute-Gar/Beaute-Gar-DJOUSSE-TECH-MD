'use strict';

/**
 * utils/messageStyle.js — point d'entree centralise de l'identite visuelle
 * des messages WhatsApp de DJOUSSE-TECH-MD.
 *
 * Le rendu réel reste dans config/style.js (une seule source de verite) :
 *   ╭┄┄『 𝚃𝙸𝚃𝚁𝙴 』┄❍
 *   │
 *   │✦ Information : Valeur
 *   │
 *   ╰┄┄┄┄┄┄┄┄┄┄┄┄⪼
 *
 * Ce module ajoute les verbes utilises par les commandes : success, error,
 * warning, info, loading, menu, command, panel, format. Il ne remplace aucune
 * commande et ne modifie pas les messages cites ou les medias.
 */

const style = require('../config/style');

const asLines = (value) => {
  if (Array.isArray(value)) return value.map(v => String(v ?? ''));
  if (value === undefined || value === null) return [''];
  return String(value).split(/\r?\n/);
};

function notice(heading, lines) {
  const body = [];
  for (const line of lines) {
    style.wrapText(line, 32).forEach((chunk, i) => {
      body.push(i === 0 ? '│✦ ' + chunk : '│  ' + chunk);
    });
  }
  return style.buildFrame(heading, body);
}

function success(value) {
  return style.renderSuccess(asLines(value));
}
function error(value) {
  return style.renderError(asLines(value));
}
function warning(value) {
  return notice('ATTENTION', asLines(value));
}
function info(value) {
  return style.renderInfo(asLines(value));
}
function loading(value) {
  return notice('TRAITEMENT', asLines(value || 'Patientez...'));
}
function menu(value) {
  const lines = asLines(value);
  return style.buildFrame('MENU DU BOT', lines);
}
function command(name, value) {
  return style.buildFrame(String(name || 'commande').toUpperCase(), asLines(value));
}
function panel(title, value) {
  return style.buildFrame(title || 'DJOUSSE TECH', asLines(value));
}
function format(value) {
  return style.renderOutgoingText(value);
}
function raw(value) {
  return value;
}

module.exports = {
  success,
  error,
  warning,
  info,
  loading,
  menu,
  command,
  panel,
  format,
  raw,
  frameHeader: style.frameHeader,
  frameFooter: style.frameFooter,
  buildFrame: style.buildFrame,
  bullet: style.bullet,
  blank: style.blank,
  wrapText: style.wrapText
};
