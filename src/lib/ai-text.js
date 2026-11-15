'use strict';

/**
 * ai-text.js — passerelle IA texte du bot.
 *
 * Essaie les fournisseurs configures dans .env, dans cet ordre :
 *   Anthropic -> Gemini -> Groq -> OpenRouter -> Pollinations (gratuit).
 * Si un fournisseur echoue, le suivant prend le relais.
 *
 * Variables reconnues :
 *   ANTHROPIC_API_KEY, AV_MODEL
 *   GEMINI_KEY, AV_GEMINI_MODEL
 *   GROQ_API_KEY, AV_GROQ_MODEL
 *   OPENROUTER_API_KEY, AV_OPENROUTER_MODEL
 *   TEXT_ENDPOINT (modele d'URL avec {prompt}, sinon POST), AV_TEXT_MODEL
 *   AV_AI=off (desactive toute l'IA), AV_AI_GAP_MS (espacement Pollinations)
 */

const TIMEOUT = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function enabled() {
  return String(process.env.AV_AI || 'on').toLowerCase() !== 'off';
}

/* --------------------------- Pollinations (gratuit) --------------------------- */

// 1 requete / 45 s par IP sur l'offre gratuite : on espace les appels.
const gapEnv = process.env.AV_AI_GAP_MS;
const MIN_GAP = gapEnv === undefined || gapEnv === '' ? 46000 : Math.max(0, Number(gapEnv) || 0);
let lastPollinationsAt = 0;
let pollinationsQueue = Promise.resolve();

function throttlePollinations() {
  const run = async () => {
    const wait = lastPollinationsAt + MIN_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastPollinationsAt = Date.now();
  };
  const p = pollinationsQueue.then(run, run);
  pollinationsQueue = p.catch(() => {});
  return p;
}

function parseText(raw) {
  const text = String(raw || '');
  try {
    const data = JSON.parse(text);
    const choice = data && data.choices && data.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (typeof content === 'string' && content.trim()) return content;
  } catch (_) { /* reponse texte simple */ }
  return text;
}

/* --------------------------------- HTTP --------------------------------- */

async function http(url, opts, retries = 1) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
    if (res.status === 402 || res.status === 429 || res.status === 404) {
      const body = await res.text().catch(() => '');
      if (retries > 0) {
        const m = body.match(/wait\s+(\d+)\s+second/i);
        const wait = m ? Math.min(70000, (parseInt(m[1], 10) + 2) * 1000) : 5000;
        clearTimeout(timer);
        await sleep(wait);
        return http(url, opts, retries - 1);
      }
      throw new Error('HTTP ' + res.status);
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ Fournisseurs ------------------------------ */

async function viaAnthropic(prompt, maxTokens) {
  const res = await http('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.AV_MODEL || 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  const block = data.content && data.content.find((b) => b.type === 'text');
  return block ? block.text : '';
}

async function viaGemini(prompt, maxTokens) {
  const model = process.env.AV_GEMINI_MODEL || 'gemini-3-flash-preview';
  const generationConfig = { maxOutputTokens: maxTokens, temperature: 0.8 };

  // Gemini 2.5/3 "raisonne" avant de repondre : sans cela, les jetons sont
  // consommes par le raisonnement et la reponse revient vide ou tronquee.
  if (/^gemini-(2\.5|3)/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await http(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      })
    }
  );
  const data = await res.json();
  const parts = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts;
  return (parts || []).map((p) => p.text || '').join('').trim();
}

async function viaOpenAICompatible(url, key, model, prompt, maxTokens, extraHeaders) {
  const res = await http(url, {
    method: 'POST',
    headers: Object.assign({
      'content-type': 'application/json',
      authorization: 'Bearer ' + key
    }, extraHeaders || {}),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.8
    })
  });
  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  return (choice && choice.message && choice.message.content) || '';
}

async function viaGroq(prompt, maxTokens) {
  return viaOpenAICompatible(
    'https://api.groq.com/openai/v1/chat/completions',
    process.env.GROQ_API_KEY,
    process.env.AV_GROQ_MODEL || 'qwen/qwen3.8-27b',
    prompt,
    maxTokens
  );
}

async function viaOpenRouter(prompt, maxTokens) {
  return viaOpenAICompatible(
    'https://openrouter.ai/api/v1/chat/completions',
    process.env.OPENROUTER_API_KEY,
    process.env.AV_OPENROUTER_MODEL || 'baidu/ernie-5.5-flash-preview:free',
    prompt,
    maxTokens,
    {
      'HTTP-Referer': 'https://github.com/Beaute-Gar/DJOUSSE-TECH-MD',
      'X-Title': 'DJOUSSE TECH MD'
    }
  );
}

async function viaPollinations(prompt, maxTokens) {
  await throttlePollinations();
  const tpl = process.env.TEXT_ENDPOINT || '';

  // Compatibilite : un modele d'URL contenant {prompt} reste appele en GET.
  if (tpl.includes('{prompt}')) {
    const url = tpl
      .replace('{prompt}', encodeURIComponent(prompt))
      .replace('{seed}', String(Math.floor(Math.random() * 1e9)));
    return parseText(await (await http(url, {})).text());
  }

  const url = tpl || 'https://text.pollinations.ai/';
  const res = await http(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: process.env.AV_TEXT_MODEL || 'openai',
      max_tokens: Math.max(400, Number(maxTokens) || 0),
      reasoning_effort: 'low'
    })
  });
  return parseText(await res.text());
}

/* --------------------------------- Chaîne --------------------------------- */

function chain() {
  const list = [];
  if (process.env.ANTHROPIC_API_KEY) list.push(['anthropic', viaAnthropic]);
  if (process.env.GEMINI_KEY) list.push(['gemini', viaGemini]);
  if (process.env.GROQ_API_KEY) list.push(['groq', viaGroq]);
  if (process.env.OPENROUTER_API_KEY) list.push(['openrouter', viaOpenRouter]);
  list.push(['pollinations', viaPollinations]);
  return list;
}

async function ask(prompt, opts) {
  if (!enabled()) throw new Error('IA désactivée (AV_AI=off)');

  // Les modeles "raisonnants" consomment des jetons avant la reponse :
  // on garde un plancher pour que le verdict OUI/NON ne soit pas vide.
  const wanted = Number(opts && opts.maxTokens) || 200;
  const maxTokens = Math.max(128, wanted);

  const errors = [];
  for (const [name, fn] of chain()) {
    try {
      const out = String((await fn(prompt, maxTokens)) || '').trim();
      if (out) return out;
      errors.push(name + ': réponse vide');
    } catch (e) {
      console.error('[ia] ' + name + ' indisponible:', e.message);
      errors.push(name + ': ' + e.message);
    }
  }
  throw new Error('aucune source IA (' + errors.join(' | ') + ')');
}

module.exports = { ask, enabled, providers: () => chain().map(([name]) => name) };
