'use strict';
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const pino = require('pino');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3001);
const NODE_ENV = process.env.NODE_ENV || 'production';

const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function ensureLogDir() {
  const file = process.env.LOG_FILE;
  if (!file) return;
  try { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); } catch {}
}
ensureLogDir();
const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.token', 'body.refreshToken'] });

// Sécurité: derrière ngrok (proxy) faire confiance au premier proxy si nécessaire
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false, // API JSON
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// CORS strict: uniquement origines explicitement autorisées, jamais '*'
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, false); // pas d'appels navigateur sans origine attendus ici
    const normalized = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(normalized)) return cb(null, true);
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning'],
  credentials: true,
  maxAge: 600,
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Refus explicite si origine fournie mais non autorisée (utile aux tests)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin.replace(/\/$/, ''))) {
    return res.status(403).json({ error: 'Origine non autorisée.' });
  }
  next();
});

// Journaux structurés + compteur de volume (aide au suivi quota ngrok gratuit ~1 Go/mois)
let traffic = { inBytes: 0, outBytes: 0, since: new Date().toISOString() };
app.use((req, res, next) => {
  const start = Date.now();
  const inB = Number(req.headers['content-length'] || 0);
  traffic.inBytes += isNaN(inB) ? 0 : inB;
  const origWrite = res.write;
  const origEnd = res.end;
  let outB = 0;
  res.write = function (chunk, ...args) { if (chunk) outB += Buffer.byteLength(chunk); return origWrite.call(this, chunk, ...args); };
  res.end = function (chunk, ...args) { if (chunk) outB += Buffer.byteLength(chunk); traffic.outBytes += outB; return origEnd.call(this, chunk, ...args); };
  res.on('finish', () => {
    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, ip: req.ip, outBytes: outB, traffic: { ...traffic } }, 'request');
  });
  next();
});

app.get('/_traffic', (req, res) => {
  // Exposé localement uniquement pour supervision (127.0.0.1). Ne pas proxier publiquement.
  const ip = req.ip || '';
  if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') return res.status(403).json({ error: 'Accès refusé.' });
  res.json({ ok: true, ...traffic, mbOutApprox: +(traffic.outBytes / (1024 * 1024)).toFixed(2) });
});

// Rate limiting global + renforcé auth
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de tentatives. Réessaie plus tard.' } });
app.use(globalLimiter);
app.use(['/auth/login', '/auth/register', '/auth/reset'], authLimiter);

// Santé (publique, minimale, sans info sensible)
app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, status: 'up' });
});

// Exemple de validation stricte (zod)
const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

// --- Auth (squelette) ---
// IMPORTANT: persistance utilisateurs/sessions/tokens et logique métier à implémenter (BDD).
// Ne pas utiliser ce stockage mémoire en production.
app.post('/auth/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });
  // TODO: vérifier identifiants (argon2/bcrypt), émettre access+refresh, poser cookie HttpOnly Secure SameSite
  return res.status(501).json({ error: 'Authentification non configurée sur ce serveur.' });
});

app.post('/auth/register', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Données invalides.' });
  return res.status(501).json({ error: 'Inscription non configurée sur ce serveur.' });
});

app.post('/auth/refresh', (_req, res) => res.status(501).json({ error: 'Non configuré.' }));
app.post('/auth/logout', (_req, res) => res.status(501).json({ error: 'Non configuré.' }));

// Middleware auth (exemple) : Authorization: Bearer <token>
function requireAuth(_req, res, _next) {
  // TODO: vérifier JWT (signature, exp, révocation) ou session serveur
  return res.status(401).json({ error: 'Authentification requise.' });
}

// Routes sensibles exemples (protégées)
app.get('/api/me', requireAuth, (_req, res) => res.json({}));
app.get('/api/admin', requireAuth, (_req, res) => res.status(403).json({ error: 'Accès refusé.' }));

// 404 / erreurs (sans détails techniques en production)
app.use((_req, res) => res.status(404).json({ error: 'Introuvable.' }));
app.use((err, _req, res, _next) => {
  logger.error({ err: err && err.message }, 'error');
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse.' });
  res.status(500).json({ error: 'Erreur interne.' });
});

if (HOST !== '127.0.0.1' && HOST !== '::1' && HOST !== 'localhost') {
  logger.warn({ host: HOST }, 'HOST non local: le backend doit écouter sur 127.0.0.1 (ngrok se connecte en local).');
}

const server = app.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT, env: NODE_ENV }, 'backend listening');
});

module.exports = { app, server };
