function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

module.exports = function config(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Méthode non autorisée.' });
  const base = (process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.VITE_API_URL || '').trim().replace(/\/$/, '');
  return sendJson(res, 200, { apiBase: base });
};
