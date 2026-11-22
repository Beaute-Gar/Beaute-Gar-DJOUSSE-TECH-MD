'use strict';

/**
 * supervisor.js — etat des sessions, watchdog et alertes.
 * S'utilise avec les commandes .sessions et .health.
 */

const states = new Map();
const strikes = new Map();
const lastAlert = new Map();
const startedAt = Date.now();

let cfg = {
  getSessions: () => [],
  getServerAdmins: () => [],
  watchdogMs: 60000
};

function stopSock(sock) {
  try {
    sock.end(new Error('watchdog'));
  } catch {
    // deja ferme
  }
}

function watchdog() {
  for (const { id, sock } of cfg.getSessions()) {
    const state = states.get(id);
    if (!state || state.status !== 'open' || !sock) continue;

    // On ne juge que si Baileys expose un etat de socket explicite.
    const closed = sock.ws && typeof sock.ws.isOpen === 'boolean' && sock.ws.isOpen === false;
    if (!closed) {
      strikes.delete(id);
      continue;
    }

    const n = (strikes.get(id) || 0) + 1;
    strikes.set(id, n);
    if (n >= 2) {
      strikes.delete(id);
      console.warn(`[supervision] ${id} : connexion figee, redemarrage.`);
      mark(id, 'reconnecting', 'watchdog');
      stopSock(sock);
    }
  }
}

function initSupervisor(opts = {}) {
  cfg = {
    getSessions: opts.getSessions || (() => []),
    getServerAdmins: opts.getServerAdmins || (() => []),
    watchdogMs: opts.watchdogMs || 60000
  };

  const timer = setInterval(watchdog, cfg.watchdogMs);
  timer.unref();
  return timer;
}

function mark(id, status, reason = '') {
  states.set(id, {
    status,
    reason,
    since: Date.now(),
    lastEvent: Date.now()
  });
  strikes.delete(id);
}

function touch(id) {
  const state = states.get(id);
  if (state) state.lastEvent = Date.now();
}

function snapshot() {
  return [...states.entries()].map(([id, s]) => ({ id, ...s }));
}

function health() {
  const m = process.memoryUsage();
  return {
    uptimeMs: Date.now() - startedAt,
    rssMb: Math.round(m.rss / 1048576),
    heapMb: Math.round(m.heapUsed / 1048576),
    sessions: snapshot()
  };
}

function admins() {
  const list = cfg.getServerAdmins() || [];
  return list.map((n) => String(n).replace(/\D/g, '')).filter((n) => n.length >= 8);
}

async function alert(key, text) {
  const now = Date.now();
  if (now - (lastAlert.get(key) || 0) < 600000) return false;
  lastAlert.set(key, now);

  console.error(`[alerte] ${text}`);

  const wanted = admins();
  if (!wanted.length) return false;

  for (const { id, sock } of cfg.getSessions()) {
    if (!sock) continue;
    if (states.get(id) && states.get(id).status !== 'open') continue;

    const number = String((sock.user && sock.user.id) || '').split(/[:@]/)[0].replace(/\D/g, '');
    if (!wanted.includes(number)) continue;

    try {
      await sock.sendMessage(`${number}@s.whatsapp.net`, { text: `🔔 ${text}` });
      return true;
    } catch (err) {
      console.error('[alerte] envoi impossible :', err.message);
    }
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function installProcessGuards({ onShutdown } = {}) {
  let closing = false;
  const MOBILE = process.env.MOBILE === '1' || process.platform === 'android';

  const stop = async (code, why) => {
    if (closing) return;
    closing = true;
    console.error(`[arret] ${why}`);

    /* Sur Android, process.exit() tuerait toute l'application Capacitor :
       on ne sort jamais du processus. Le runtime reste en vie et le socket
       WhatsApp continue de se reconnecter normalement. Sur PC, le comportement
       d'origine (sortie apres nettoyage) est conserve. */
    if (!MOBILE) {
      const timer = setTimeout(() => process.exit(code), 10000);
      timer.unref();
    }

    try {
      await onShutdown?.();
    } catch (err) {
      console.error(err);
    }
    if (!MOBILE) process.exit(code);
  };

  process.on('SIGINT', () => stop(0, 'SIGINT'));
  process.on('SIGTERM', () => stop(0, 'SIGTERM'));

  process.on('uncaughtException', (err) => {
    // Erreur complete dans les logs : on ne masque rien.
    console.error('[uncaughtException]', (err && err.stack) || err);
    if (MOBILE) {
      console.error('[supervisor] Android : exception isolee journalisee, processus maintenu.');
      return;
    }
    stop(1, 'uncaughtException');
  });

  // On ne tue PAS le bot sur une promesse rejetee : on la journalise.
  process.on('unhandledRejection', (reason) => {
    const text = String((reason && reason.message) || reason);
    console.error('[unhandledRejection]', text);
    alert('unhandled', `Erreur non geree : ${text.slice(0, 200)}`).catch(() => {});
  });

  return { stop, sleep };
}

module.exports = {
  initSupervisor,
  mark,
  touch,
  snapshot,
  health,
  alert,
  installProcessGuards
};
