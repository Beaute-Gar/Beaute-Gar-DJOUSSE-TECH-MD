// Configuration publique du front (aucun secret).
// Pour pointer vers le backend local exposé via ngrok, définir l'URL publique HTTPS :
//   window.DJS_API_BASE = 'https://[A_REMPLIR].ngrok-free.app';
// Laisser vide ('') pour utiliser les routes same-origin /api/* (mode Vercel/proxy).
window.DJS_API_BASE = window.DJS_API_BASE || '';
// Délai total et tentatives pour la résilience en cas de tunnel coupé.
window.DJS_API_TIMEOUT_MS = window.DJS_API_TIMEOUT_MS || 12000;
window.DJS_API_RETRIES = typeof window.DJS_API_RETRIES === 'number' ? window.DJS_API_RETRIES : 2;
