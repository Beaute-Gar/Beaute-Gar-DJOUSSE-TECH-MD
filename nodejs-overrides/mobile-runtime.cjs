'use strict';
/* Pont entre le bot (Baileys) et l'interface : jumelage, statut.
   v3 : attend que le socket soit reellement ouvert (connection=connecting ou qr),
   reessaie, journalise chaque etape, ne perd jamais le socket. */
let channel = null;
const state = {
  status: 'idle',
  sock: null,
  number: null,
  qrSeen: false,
  socketOpen: false,
  connection: null,
  lastCode: null,
  extra: {},
  busy: false
};

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function init(ch) { channel = ch; console.log('[mobile] runtime.init : channel=' + (channel ? 'ok' : 'ABSENT')); }
function emit(ev, payload) {
  try {
    if (channel) channel.send(ev, payload);
    else console.error('[mobile] emit(' + ev + ') sans channel');
  } catch (e) { console.error('[mobile] emit(' + ev + ') erreur : ' + e.message); }
}
function emitStatus() { emit('bot:status', Object.assign({ state: state.status, number: state.number, connection: state.connection }, state.extra)); }
function setStatus(s, extra) {
  if (state.status !== s) console.log('[mobile] statut : ' + state.status + ' -> ' + s + (extra ? ' ' + JSON.stringify(extra) : ''));
  state.status = s;
  state.extra = extra || {};
  emitStatus();
}
function getStatus() { return state.status; }
function ownerNumber() { return state.number; }
function snapshot() {
  return {
    status: state.status, number: state.number, connection: state.connection,
    qrSeen: state.qrSeen, socketOpen: state.socketOpen, busy: state.busy
  };
}

function isRegistered(sock) {
  return !!(sock && sock.authState && sock.authState.creds && sock.authState.creds.registered);
}

function attach(sock) {
  if (!sock) { console.error('[mobile] attach(sock) : socket nul'); return; }
  if (state.sock === sock) { console.log('[mobile] attach : socket deja attache'); return; }
  state.sock = sock;
  state.qrSeen = false;
  state.socketOpen = false;
  state.connection = null;
  console.log('[mobile] socket attache (enregistre=' + isRegistered(sock) + ')');
  try {
    if (!isRegistered(sock) && state.status !== 'awaiting_link') setStatus('needs_pairing');
    sock.ev.on('connection.update', function (u) {
      if (state.sock !== sock) return;
      const keys = Object.keys(u || {});
      console.log('[mobile] connection.update recu : ' + JSON.stringify({
        connection: u && u.connection,
        hasQr: !!(u && u.qr),
        isNewLogin: !!(u && u.isNewLogin),
        keys: keys,
        error: u && u.lastDisconnect && u.lastDisconnect.error && (u.lastDisconnect.error.message || String(u.lastDisconnect.error))
      }));
      if (u && u.qr) {
        state.qrSeen = true;
        console.log('[mobile] QR recu : le socket est pret pour requestPairingCode');
      }
      if (u && u.connection) {
        state.connection = u.connection;
        if (u.connection === 'connecting' || u.connection === 'open') state.socketOpen = true;
      }
      if (!u) return;
      if (u.connection === 'connecting') {
        if (isRegistered(sock)) setStatus('connecting');
      } else if (u.connection === 'open') {
        state.socketOpen = true;
        state.qrSeen = true;
        const id = (sock.user && sock.user.id) || '';
        state.number = id.split(':')[0].split('@')[0] || state.number;
        setStatus('connected');
        console.log('[mobile] CONNECTE : +' + state.number);
      } else if (u.connection === 'close') {
        state.socketOpen = false;
        state.qrSeen = false;
        state.connection = 'close';
        const err = u.lastDisconnect && u.lastDisconnect.error;
        const code = err && err.output && err.output.statusCode;
        console.log('[mobile] connexion fermee, code=' + code + ' message=' + ((err && err.message) || 'aucun'));
        if (code === 401) setStatus('logged_out', { code: code });
        else if (isRegistered(sock)) setStatus('disconnected', { code: code || null });
      }
    });
  } catch (e) {
    console.error('[mobile] attach:', (e && e.stack) || e);
  }
}

async function waitSocket(ms) {
  const t = Date.now();
  while (!state.socketOpen && !state.qrSeen && Date.now() - t < ms) await sleep(250);
  return !!(state.socketOpen || state.qrSeen);
}

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise(function (_, rej) {
      setTimeout(function () {
        rej(new Error('Delai depasse (' + Math.round(ms / 1000) + ' s' + (label ? ' : ' + label : '') + '). Verifie ta connexion Internet.'));
      }, ms);
    })
  ]);
}

async function requestPairing(number) {
  const n = String(number || '').replace(/\D/g, '');
  console.log('[mobile] demande de code pour +' + (n || '(vide)') + ' ; etat=' + JSON.stringify(snapshot()));
  if (n.length < 8 || n.length > 15) {
    emit('pair:error', { message: 'Numero invalide (8 a 15 chiffres, avec indicatif).' });
    return;
  }
  if (state.busy) {
    emit('pair:error', { message: 'Une demande est deja en cours, patiente quelques secondes.' });
    return;
  }
  state.busy = true;
  try {
    state.number = n;
    setStatus('waiting_socket');

    const starter = globalThis.__DJOUSSE_START_SESSION__;
    if (typeof starter !== 'function') {
      console.log('[mobile] bot pas encore charge : attente de __DJOUSSE_START_SESSION__ (max 45 s)...');
      const t0 = Date.now();
      while (typeof globalThis.__DJOUSSE_START_SESSION__ !== 'function' && Date.now() - t0 < 45000) {
        await sleep(500);
      }
      if (typeof globalThis.__DJOUSSE_START_SESSION__ !== 'function') {
        console.error('[mobile] __DJOUSSE_START_SESSION__ absent apres 45 s : index.js a plante au chargement (voir erreurs plus haut).');
        setStatus('crashed', { message: 'Moteur du bot non charge' });
        emit('pair:error', { message: 'Le moteur du bot ne s\'est pas charge (delai 45 s). Ouvre le Journal.' });
        return;
      }
    }

    console.log('[mobile] creation du socket WhatsApp...');
    let sock = await withTimeout(globalThis.__DJOUSSE_START_SESSION__(n), 60000, 'creation du socket');
    console.log('[mobile] socket cree : ' + (sock ? 'ok' : 'nul'));
    if (sock) attach(sock);
    sock = state.sock;
    if (!sock) {
      emit('pair:error', { message: 'Impossible de creer la connexion WhatsApp.' });
      return;
    }
    if (isRegistered(sock)) {
      emit('pair:error', { message: 'Un compte est deja lie. Reinitialise la session pour en lier un autre.' });
      return;
    }

    let lastErr = null;
    for (let i = 1; i <= 3; i++) {
      sock = state.sock || sock;
      if (!sock) {
        lastErr = new Error('Le socket a ete perdu avant l\'essai ' + i + '.');
        console.error('[mobile] ' + lastErr.message);
        break;
      }
      const ready = await waitSocket(i === 1 ? 30000 : 15000);
      console.log('[mobile] essai ' + i + '/3 : socket pret=' + ready + ' etat=' + JSON.stringify(snapshot()));
      try {
        console.log('[mobile] appel requestPairingCode(+' + n + ')...');
        const code = await withTimeout(sock.requestPairingCode(n), 30000, 'requestPairingCode');
        if (!code) throw new Error('requestPairingCode a renvoye un code vide');
        console.log('[mobile] code genere : ' + String(code).length + ' caracteres (code masque dans les logs)');
        state.lastCode = String(code);
        const pretty = (String(code).match(/.{1,4}/g) || [String(code)]).join('-');
        setStatus('awaiting_link');
        emit('pair:code', { code: pretty });
        console.log('[mobile] pair:code envoye a l\'interface');
        return;
      } catch (e) {
        lastErr = e;
        console.error('[mobile] requestPairingCode essai ' + i + ' echoue : ' + ((e && e.message) || e));
        if (e && e.stack) console.error(e.stack);
        await sleep(3000);
      }
    }
    setStatus('needs_pairing');
    emit('pair:error', { message: (lastErr && lastErr.message) || 'Echec de generation du code.' });
  } catch (e) {
    console.error('[mobile] requestPairing:', (e && e.stack) || e);
    setStatus('needs_pairing');
    emit('pair:error', { message: 'Erreur : ' + ((e && e.message) || e) });
  } finally {
    state.busy = false;
    console.log('[mobile] requestPairing termine ; etat=' + JSON.stringify(snapshot()));
  }
}

module.exports = {
  init: init,
  attach: attach,
  requestPairing: requestPairing,
  setStatus: setStatus,
  getStatus: getStatus,
  emitStatus: emitStatus,
  ownerNumber: ownerNumber,
  emit: emit,
  snapshot: snapshot
};
