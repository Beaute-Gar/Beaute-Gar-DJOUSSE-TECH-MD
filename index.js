'use strict';

const path     = require('path');
const fs       = require('fs');
const pino     = require('pino');
const readline = require('readline');
const http = require('http');

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const config     = require('./src/config/config');
const paths      = require('./src/config/paths');
const style      = require('./src/config/style');
const cmdHandler = require('./src/handlers/command-handler');
const { handleMessage } = require('./src/handlers/handler');
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
 * Empeche deux instances simultanees : deux sockets sur la meme session
 * provoquent la boucle WhatsApp 440 et le conflit EADDRINUSE sur le port 3001.
 */
function acquireInstanceLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const owner = Number.parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      if (owner && owner !== process.pid && isProcessAlive(owner)) {
        console.log(style.renderError([
          `Une autre instance du bot tourne deja (PID ${owner}).`,
          'Arrete-la avant de relancer : deux instances provoquent la boucle WhatsApp 440.'
        ]));
        process.exit(1);
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

/**
 * Identifiant d'une session dans le registre des groupes.
 * On utilise le numero WhatsApp (sock.user.id) et non le nom du dossier,
 * car c'est ce que group-owner stocke. Repli sur le nom du dossier.
 */
function sessionKey(sock, fallback) {
  return normalizeJid(sock && sock.user && sock.user.id) || fallback;
}

async function startSession(sessionName) {
  // Evite de creer deux sockets pour la meme session.
  const existing = activeSockets.get(sessionName);
  if (existing) return existing;

  const sessionPath = path.join(SESSIONS_DIR, sessionName);

  // Evite de liker deux fois le meme statut (messages.upsert peut le relivrer).
  const reactedStatuses = new Set();

  // 1. Charger l'authentification (verifie et sauvegarde creds.json)
  const { state, saveCreds } = await openAuth(sessionPath);

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    version = undefined;
  }

  // 2. Creer le socket
  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['Mac OS', 'Chrome', '14.4.1'],
    // Permet a Baileys de retrouver un message recent pour les retries.
    getMessage: async (key) => {
      try {
        return getCachedMessage(key.remoteJid, key.id) || undefined;
      } catch (e) {
        return undefined;
      }
    }
  });

  // Anti-ban : ralentit chaque envoi (delai + « ecrit... » + quota/minute).
  // Desactivable via HUMANIZE=false dans .env
  if (config.humanize) {
    humanize(sock, config.humanizeOptions);
  }

  activeSockets.set(sessionName, sock);
  supervisor.mark(sessionName, 'connecting');

  // 3. Gestion de la connexion
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      // Ignore l'evenement d'un ancien socket remplace par une reconnexion.
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
        // Reconnectable : on garde la propriete des groupes pendant le delai.
        groupOwner.markDown(sessionKey(sock, sessionName));
        setTimeout(() => startSession(sessionName), 3000);
      } else {
        // Deconnexion definitive : on libere le groupe et on restaure les droits.
        const others = [...activeSockets.values()].filter((s) => s !== sock);
        try {
          await require('./src/jeux/actionverite').abortSession(sessionKey(sock, sessionName), others[0]);
        } catch (e) {
          console.error('[actionverite] arret de session impossible :', e.message);
        }
        try {
          await require('./src/jeux').abortSession(sessionKey(sock, sessionName), others[0]);
        } catch (e) {
          console.error('[jeux] arret des parties impossible :', e.message);
        }
        try {
          require('./src/jeux').stopSession(sessionKey(sock, sessionName));
        } catch (e) {
          console.error('[jeux] arret de session impossible :', e.message);
        }
        groupOwner.releaseSession(sessionKey(sock, sessionName), 'deconnexion definitive');

        // Session deconnectee/expiree : on supprime les identifiants devenus invalides
        // pour qu'une nouvelle demande de code reparte sur une base propre.
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

      // Restaure les droits des groupes si le bot a plante en pleine partie.
      try {
        require('./src/jeux/actionverite').recover(sock).catch((e) => {
          console.error('[actionverite] recuperation impossible :', e.message);
        });
      } catch (e) {
        console.error('[actionverite] module indisponible :', e.message);
      }

      // Quiz, Loup-Garou et mode nuit : démarre les minuteries de cette session.
      try {
        require('./src/jeux').start(sock).catch((e) => {
          console.error('[jeux] demarrage impossible :', e.message);
        });
      } catch (e) {
        console.error('[jeux] module indisponible :', e.message);
      }

      // Statut automatique : publie des statuts (citations amour/triste/motivation + media) periodiquement.
      try {
        const autoStatus = require('./src/lib/auto-status-poster.js');
        autoStatus.start(sock);
      } catch (e) {
        console.error('[auto-status] module indisponible :', e.message);
      }

      // Restauration des rappels persistants
      try {
        const reminders = db.getSetting('reminders', []);
        const now = Date.now();
        const keep = [];
        for (const r of reminders) {
          if (!r || !r.from || !r.message || !r.dueAt) continue;
          if (r.dueAt <= now) {
            try { await sock.sendMessage(r.from, { text: `🔔 RAPPEL (en retard) : ${r.message}` }); } catch (e) {}
          } else {
            keep.push(r);
            try {
              const mod = require('./src/commandes/10-divers/remind.js');
              if (mod && typeof mod.scheduleReminder === 'function') mod.scheduleReminder(sock, r);
            } catch (e) {}
          }
        }
        db.setSetting('reminders', keep);
      } catch (e) {}
    }
  });

  // 4. Sauvegarde des identifiants
  sock.ev.on('creds.update', saveCreds);

  // 5. Mise en cache des messages pour l'ANTI-DELETE
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    supervisor.touch(sessionName);
    if (type !== 'notify') return;
    for (const m of messages) {
      const jid = m.key && m.key.remoteJid;
      if (jid && jid.endsWith('@g.us') && !groupOwner.canRead(sock, jid)) continue;
      cacheMessage(m);
      // Capture les medias des messages vue unique pour revelation manuelle ulterieure (.vv)
      await captureViewOnce(sock, m).catch(() => {});
      await handleAutoViewOnce(sock, m); // On stocke pour l'anti-delete
    }
  });

  // 6. Detection des suppressions (ANTI-DELETE)
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

  // 7. Gestion des commandes + autoread/autostatus (best effort)
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        const jid = m.key && m.key.remoteJid;
        if (jid && jid.endsWith('@g.us') && !groupOwner.canRead(sock, jid)) continue;

        // Garde le nom des membres pour les messages de depart.
        try { rememberMessage(m); } catch (e) {}

        if (db.getSetting('autoread', false) && m.key && m.key.remoteJid && m.key.remoteJid !== 'status@broadcast') {
          try { await sock.readMessages([m.key]); } catch (e) {}
        }
        if (m.key && m.key.remoteJid === 'status@broadcast') {
          try {
            const autostatus = require('./src/lib/autostatus');
            const as = autostatus.load();

            if (as.view) {
              try { await sock.readMessages([m.key]); } catch (e) {}
            }

            // Fonctionnalite automatique : vue + reaction aux statuts.
            // Aucune commande. resolveReaction refuse toujours le coeur vert 💚.
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

  // 8. Gestion des groupes (blacklist a l'arrivee, bienvenue / au revoir)
  sock.ev.on('group-participants.update', async (update) => {
    try {
      await handleGroupEvent(sock, update);
    } catch (err) {
      console.error('[GROUP EVENT ERROR]', err.message);
    }
  });

  return sock;
}

// --- RESTAURATION AUTOMATIQUE DES SESSIONS EXISTANTES ---
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

      if (sock && sock.authState && sock.authState.creds && !sock.authState.creds.registered) {
        console.log(style.renderError([
          `${name} n'est pas jumele.`,
          `Tape ${name} dans la console pour obtenir un code d'appairage.`
        ]));
      }
    } catch (err) {
      console.error(`[auto] ${name} :`, err.message);
    }

    // Etale les connexions pour eviter une rafale au demarrage.
    if (i < names.length - 1) {
      await new Promise((r) => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
    }
  }

  return started;
}

// --- API HTTP locale (jumelage / statut) pour tunnel ngrok -> Vercel ---
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10000) { req.destroy(); reject(new Error('body-too-large')); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid-json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function getPairingStats() {
  let sessions = 0;
  let active = 0;
  let waiting = 0;
  for (const [, sock] of activeSockets) {
    sessions += 1;
    try {
      if (sock && sock.authState && sock.authState.creds && sock.authState.creds.registered) {
        active += 1;
      } else if (sock) {
        waiting += 1;
      }
    } catch {}
  }
  const connected = active > 0;
  const status = connected ? 'connected' : (waiting > 0 ? 'waiting' : 'disconnected');
  return {
    ok: true,
    online: true,
    connected,
    connection: connected ? 'OPEN' : (waiting > 0 ? 'PAIRING' : 'INCONNU'),
    sessions,
    active,
    status
  };
}

function pairingStatus() {
  return getPairingStats().status;
}

async function waitForPairingSocket(number, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const sock = activeSockets.get(number);
    if (sock && sock.authState && sock.authState.creds && !sock.authState.creds.registered) {
      return sock;
    }
    if (sock && sock.authState && sock.authState.creds && sock.authState.creds.registered) {
      const err = new Error('already-registered');
      err.code = 'ALREADY_REGISTERED';
      throw err;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return activeSockets.get(number) || null;
}

function startPairingServer() {
  const token = process.env.PAIRING_API_TOKEN || '';
  const host = process.env.PAIRING_HOST || process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PAIRING_PORT || process.env.PORT || 3001);
  if (!Number.isFinite(port) || port <= 0) return;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');

      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
        return sendJson(res, 200, getPairingStats());
      }

      if (token && req.headers['x-api-token'] !== token) {
        return sendJson(res, 401, { error: 'Non autorisé.' });
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        return sendJson(res, 200, getPairingStats());
      }

      if (req.method === 'POST' && url.pathname === '/pair') {
        const body = await readBody(req).catch((e) => { throw e; });
        const raw = body && (body.number || body.phone || body.session || '');
        const number = String(raw).replace(/[^0-9]/g, '');
        if (number.length < 8 || number.length > 15) {
          return sendJson(res, 400, { error: 'Numéro invalide.' });
        }

        let sock = activeSockets.get(number);
        if (sock && sock.authState && sock.authState.creds && sock.authState.creds.registered) {
          return sendJson(res, 409, { error: 'Cette session est déjà jumelée.' });
        }

        console.log(`[pair-api] Demande de code pour ${number}...`);
        if (!sock) {
          await startSession(number);
        }

        await new Promise((r) => setTimeout(r, 3000));
        sock = await waitForPairingSocket(number, 30000).catch((e) => { throw e; });
        if (!sock) return sendJson(res, 503, { error: 'Session indisponible. Réessayez.' });
        if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
          return sendJson(res, 409, { error: 'Cette session est déjà jumelée.' });
        }

        const code = await sock.requestPairingCode(number);
        console.log(style.renderSuccess([`[pair-api] Code d'appairage ${number} : ${code}`]));
        return sendJson(res, 200, { code: String(code) });
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (e) {
      if (e && e.code === 'ALREADY_REGISTERED') {
        return sendJson(res, 409, { error: 'Cette session est déjà jumelée.' });
      }
      if (e && e.message === 'invalid-json') return sendJson(res, 400, { error: 'JSON invalide.' });
      console.error('[pair-api]', e && e.message ? e.message : e);
      if (!res.headersSent) return sendJson(res, 503, { error: 'Service de jumelage indisponible.' });
    }
  });

  server.on('error', (err) => console.error('[pair-api] serveur:', err.message));
  server.listen(port, host, () => {
    console.log(`[pair-api] API locale sur http://${host}:${port} (tunnel ngrok -> Vercel)`);
  });
  return server;
}

// --- GESTIONNAIRE DE SESSIONS AU DEMARRAGE ---
async function startBot() {
  acquireInstanceLock();
  await installLogger({ dir: path.join(paths.storage, 'logs'), keepDays: 14 });
  try { setConnectedOwners([]); } catch (_) {}

  cmdHandler.loadCommands();

  // Supervision : etat des sessions, watchdog, alertes
  supervisor.initSupervisor({
    getSessions: () => [...activeSockets.entries()].map(([id, sock]) => ({ id, sock })),
    getServerAdmins: () => [
      config.ownerNumber,
      db.getSetting('ownerNumber'),
      db.getSetting('botNumber'),
      getOwnerNumber(config)
    ]
  });

  // Registre des groupes : une seule session traite chaque groupe.
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

  // Arret propre : on ferme les sockets et le journal
  supervisor.installProcessGuards({
    onShutdown: async () => {
      for (const [, sock] of activeSockets) {
        try { sock.end(undefined); } catch (e) {}
      }
      await closeLogger();
    }
  });

  // API HTTP locale (pairing/status) pour exposition via ngrok
  startPairingServer();

  // Sauvegarde chiffree des sessions (cle : SESSION_BACKUP_KEY)
  const backupDir = path.join(paths.storage, 'backups');
  const runBackup = async () => {
    try {
      const n = await backupAll({ sessionsDir: paths.sessions, backupDir, keepDays: 7 });
      if (n) console.log(`[backup] ${n} session(s) sauvegardee(s).`);
    } catch (err) {
      console.error('[backup]', err.message);
    }
  };
  setTimeout(runBackup, 60000).unref();
  setInterval(runBackup, 6 * 3600000).unref();

  console.clear();
  console.log(style.box(config.botName + ' | MULTI-SESSION', [
    'Les sessions deja jumelees demarrent seules',
    'Entrez un numero WhatsApp pour en ajouter une',
    'Tapez "liste" pour voir les sessions',
    'Tapez "quitter" pour arreter'
  ]));

  // Demarrage automatique des sessions deja jumelees
  const restored = config.autoStart ? await restoreSessions() : [];
  if (!config.autoStart) {
    console.log(style.renderInfo(['Demarrage automatique desactive (AUTO_START=false).']));
  } else if (restored.length) {
    console.log(style.renderSuccess([`${restored.length} session(s) restauree(s) : ${restored.join(', ')}`]));
  } else {
    console.log(style.renderInfo(['Aucune session existante a restaurer.']));
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('📱 Numero (ex: 237690000000) | liste | quitter > ');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) return rl.prompt();

    if (input.toLowerCase() === 'quitter' || input.toLowerCase() === 'exit') {
      process.exit(0);
    }

    if (input.toLowerCase() === 'liste') {
      console.log('Sessions actives : ' + [...activeSockets.keys()].join(', '));
      return rl.prompt();
    }

    const number = input.replace(/[^0-9]/g, '');
    if (number.length < 8 || number.length > 15) {
      console.log('❌ Numero invalide.');
      return rl.prompt();
    }

    console.log(`⏳ Connexion de ${number}...`);
    await startSession(number);

    // Demande du code d'appairage
    const sock = activeSockets.get(number);
    if (sock && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(number);
          console.log(style.renderSuccess([`Code d'appairage : ${code}`]));
        } catch (e) {
          console.log(style.renderError([`Erreur : ${e.message}`]));
        }
      }, 3000);
    }
    rl.prompt();
  });
}

startBot().catch((err) => {
  console.log(style.renderError([`Fatal : ${err.message}`]));
  process.exit(1);
});

