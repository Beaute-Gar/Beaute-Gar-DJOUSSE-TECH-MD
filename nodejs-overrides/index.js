'use strict';

try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const path     = require('path');
const fs       = require('fs');
const pino     = require('pino');
const readline = require('readline');
const http     = require('http');

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const config     = require('./src/config/config');
const paths      = require('./src/config/paths');
const style      = require('./src/config/style');
const cmdHandler = require('./src/handlers/command-handler');
const { handleMessage, installOutboundStyle } = require('./src/handlers/handler');
const { handleProtection } = require('./src/handlers/protection-handler');
const { handleAutoViewOnce } = require('./src/handlers/autovv-handler');
const { handleGroupEvent } = require('./src/handlers/group-handler');
const { cacheMessage, handleAntiDelete, captureViewOnce, getCachedMessage } = require('./src/handlers/antidelete-handler');
const db         = require('./src/lib/database');
const { humanize } = require('./src/lib/humanize');
const { rememberMessage } = require('./src/lib/member-cache');
const { installLogger, closeLogger } = require('./src/lib/logger');
const { openAuth, backupAll } = require('./src/core/authSafe');
const supervisor = require('./src/core/supervisor');
const groupOwner = require('./src/core/group-owner');
const { getOwnerNumber, addConnectedOwner, removeConnectedOwner, setConnectedOwners } = require('./src/lib/auth');
const { normalizeJid } = require('./src/lib/helpers');

const SESSIONS_DIR = path.join(paths.storage, 'sessions');

[paths.storage, paths.sessions, paths.database, paths.downloads].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const LOCK_FILE = path.join(paths.storage, 'bot.lock');

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

/**
 * Empeche deux instances simultanees
 */
function acquireInstanceLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const owner = Number.parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (owner && owner !== process.pid && isProcessAlive(owner)) {
        console.log(style.renderError([
          `Une autre instance du bot tourne deja (PID ${owner}).`
        ]));
        if (process.env.MOBILE !== '1') process.exit(1);
      }
    }

    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
    process.on('exit', () => {
      try {
        if (!fs.existsSync(LOCK_FILE)) return;
        const owner = Number.parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
        if (owner === process.pid) fs.unlinkSync(LOCK_FILE);
      } catch (_) {}
    });
  } catch (err) {
    console.error('[lock] Impossible de verifier l instance unique :', err.message);
  }
}

const activeSockets = new Map();

function sessionKey(sock, fallback) {
  return normalizeJid(sock && sock.user && sock.user.id) || fallback;
}

async function startSession(sessionName) {
  const existing = activeSockets.get(sessionName);
  if (existing) return existing;

  const sessionPath = path.join(SESSIONS_DIR, sessionName);
  const reactedStatuses = new Set();

  const { state, saveCreds } = await openAuth(sessionPath);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    version = undefined;
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    getMessage: async (key) => {
      try {
        return getCachedMessage(key.remoteJid, key.id) || undefined;
      } catch (e) {
        return undefined;
      }
    }
  });

  // Style centralisé sur TOUS les envois, y compris les événements
  // (antidelete, arrivées/départs, protections) qui ne passent pas par onMessage.
  installOutboundStyle(sock);

  if (process.env.MOBILE === '1' && globalThis.__DJOUSSE_MOBILE__) {
    globalThis.__DJOUSSE_MOBILE__.attach(sock);
  }

  if (config.humanize) {
    humanize(sock, config.humanizeOptions);
  }

  activeSockets.set(sessionName, sock);
  supervisor.mark(sessionName, 'connecting');

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const current = activeSockets.get(sessionName);
      if (current && current !== sock) return;

      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const shouldReconnect = !loggedOut && code !== 405;

      console.log(style.renderError([
        `[${sessionName}] Connexion fermee (${code ?? 'inconnu'})`,
        `Reconnexion : ${shouldReconnect}`
      ]));

      supervisor.mark(sessionName, shouldReconnect ? 'reconnecting' : 'closed', String(code ?? 'inconnu'));
      activeSockets.delete(sessionName);
      removeConnectedOwner(sessionKey(sock, sessionName));

      if (shouldReconnect) {
        groupOwner.markDown(sessionKey(sock, sessionName));
        setTimeout(() => startSession(sessionName), 3000);
      } else {
        const others = [...activeSockets.values()].filter((s) => s !== sock);
        try {
          await require('./src/jeux/actionverite').abortSession(sessionKey(sock, sessionName), others[0]);
        } catch (e) {}
        try {
          await require('./src/jeux').abortSession(sessionKey(sock, sessionName), others[0]);
        } catch (e) {}
        try {
          require('./src/jeux').stopSession(sessionKey(sock, sessionName));
        } catch (e) {}
        groupOwner.releaseSession(sessionKey(sock, sessionName), 'deconnexion definitive');

        if (loggedOut) {
          try {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            console.log(`[${sessionName}] Session locale supprimee (deconnexion definitive).`);
          } catch (e) {}
        }
      }
    }

    if (connection === 'open') {
      groupOwner.markUp(sessionKey(sock, sessionName));
      try { await sock.updateReadReceiptsPrivacy('all'); } catch (e) {}

      supervisor.mark(sessionName, 'open');

      const myNumber = sock.user.id.split(':')[0];
      db.setSetting('botNumber', myNumber);
      addConnectedOwner(myNumber);
      addConnectedOwner(sessionName);
      console.log(`[${sessionName}] Connecte : ${myNumber}`);

      try {
        require('./src/jeux/actionverite').recover(sock).catch(() => {});
      } catch (e) {}
      try {
        require('./src/jeux').start(sock).catch(() => {});
      } catch (e) {}
      try {
        const autoStatus = require('./src/lib/auto-status-poster.js');
        autoStatus.start(sock);
      } catch (e) {}
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    supervisor.touch(sessionName);
    if (type !== 'notify') return;
    for (const m of messages) {
      const jid = m.key && m.key.remoteJid;
      if (jid && jid.endsWith('@g.us') && !groupOwner.canRead(sock, jid)) continue;
      cacheMessage(m);
      // PROTECTIONS : c'était le maillon manquant. Sans cet appel, les réglages
      // antisticker/antilink/antibadword/etc. n'étaient jamais évalués.
      try {
        await handleProtection(sock, m);
      } catch (err) {
        console.error('[PROTECTION ERROR]', err && err.message);
      }
      await captureViewOnce(sock, m).catch(() => {});
      await handleAutoViewOnce(sock, m);
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    try {
      const allowed = (updates || []).filter((u) => {
        const jid = u && u.key && u.key.remoteJid;
        return !jid || !jid.endsWith('@g.us') || groupOwner.canRead(sock, jid);
      });
      if (!allowed.length) return;
      await handleAntiDelete(sock, allowed);
    } catch (err) {
      console.error('[ANTIDELETE ERROR]', err.message);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        const jid = m.key && m.key.remoteJid;
        if (jid && jid.endsWith('@g.us') && !groupOwner.canRead(sock, jid)) continue;
        try { rememberMessage(m); } catch (e) {}

        if (db.getSetting('autoread', false) && m.key && m.key.remoteJid && m.key.remoteJid !== 'status@broadcast') {
          try { await sock.readMessages([m.key]); } catch (e) {}
        }

        // Statuts WhatsApp : lecture (voir) + reaction (like) automatiques.
        // Ce bloc etait present dans le bot PC mais absent de l'APK.
        if (m.key && m.key.remoteJid === 'status@broadcast') {
          try {
            const autostatus = require('./src/lib/autostatus');
            const as = autostatus.load();

            if (as.view) {
              try { await sock.readMessages([m.key]); } catch (e) {}
            }

            // resolveReaction refuse toujours le coeur vert 💚.
            const reaction = autostatus.reactionForStatus(as);

            if (reaction && m.key.id && !reactedStatuses.has(m.key.id)) {
              reactedStatuses.add(m.key.id);
              if (reactedStatuses.size > 500) {
                reactedStatuses.delete(reactedStatuses.values().next().value);
              }

              const jidList = m.key.participant ? [m.key.participant] : undefined;
              try {
                await sock.sendMessage(
                  'status@broadcast',
                  { react: { text: reaction, key: m.key } },
                  jidList ? { statusJidList: jidList } : undefined
                );
              } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {}
      try {
        await handleMessage(sock, m);
      } catch (err) {
        console.error(`[${sessionName}] Erreur commande :`, err.message);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleGroupEvent(sock, update);
    } catch (err) {
      console.error('[GROUP EVENT ERROR]', err.message);
    }
  });

  return sock;
}

// Expose startSession pour le runtime mobile
globalThis.__DJOUSSE_START_SESSION__ = startSession;

async function restoreSessions() {
  let entries = [];
  try {
    entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const names = entries
    .filter((e) => e.isDirectory() && /^\d{6,15}$/.test(e.name))
    .map((e) => e.name);

  const started = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const creds = path.join(SESSIONS_DIR, name, 'creds.json');
    if (!fs.existsSync(creds)) continue;

    try {
      console.log(style.renderInfo([`Restauration automatique de la session ${name}...`]));
      const sock = await startSession(name);
      started.push(name);
    } catch (err) {
      console.error(`[auto] ${name} :`, err.message);
    }

    if (i < names.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return started;
}

function startPairingServer() {
  if (process.env.MOBILE === '1') return null;
  const host = process.env.PAIRING_HOST || '127.0.0.1';
  const port = Number(process.env.PAIRING_PORT || 3001);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  server.listen(port, host);
  return server;
}

async function startBot() {
  acquireInstanceLock();
  await installLogger({ dir: path.join(paths.storage, 'logs'), keepDays: 14 });
  try { setConnectedOwners([]); } catch (_) {}

  cmdHandler.loadCommands();

  supervisor.initSupervisor({
    getSessions: () => [...activeSockets.entries()].map(([id, sock]) => ({ id, sock })),
    getServerAdmins: () => [
      config.ownerNumber,
      db.getSetting('ownerNumber'),
      db.getSetting('botNumber'),
      getOwnerNumber(config)
    ]
  });

  groupOwner.setRuntime({
    isAlive: (id) => {
      const target = normalizeJid(id);
      if (!target) return false;
      for (const [name, s] of activeSockets) {
        if (name === id || name === target) return true;
        if (normalizeJid(s.user && s.user.id) === target) return true;
      }
      return false;
    },
    listActive: () => [...activeSockets.values()]
      .map((s) => normalizeJid(s.user && s.user.id))
      .filter(Boolean)
  });

  supervisor.installProcessGuards({
    onShutdown: async () => {
      for (const [, sock] of activeSockets) {
        try { sock.end(undefined); } catch (e) {}
      }
      await closeLogger();
    }
  });

  if (process.env.MOBILE !== '1') startPairingServer();

  const restored = config.autoStart ? await restoreSessions() : [];
  if (restored.length) {
    console.log(style.renderSuccess([`${restored.length} session(s) restauree(s) : ${restored.join(', ')}`]));
  } else {
    console.log(style.renderInfo(['Aucune session existante a restaurer.']));
    if (process.env.MOBILE === '1' && globalThis.__DJOUSSE_MOBILE__) {
      globalThis.__DJOUSSE_MOBILE__.setStatus('needs_pairing');
    }
  }

  if (process.env.MOBILE === '1') {
    console.log('[mobile] Mode mobile actif. Bot prêt.');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('📱 Numero | liste | quitter > ');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return rl.prompt();
    if (input.toLowerCase() === 'quitter') process.exit(0);
    const number = input.replace(/[^0-9]/g, '');
    if (number.length >= 8 && number.length <= 15) {
      await startSession(number);
    }
    rl.prompt();
  });
}

startBot().catch((err) => {
  console.log(style.renderError([`Fatal : ${err.message}`]));
  if (process.env.MOBILE !== '1') process.exit(1);
});
