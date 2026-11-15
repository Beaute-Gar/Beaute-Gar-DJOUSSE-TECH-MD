'use strict';

const { parsePhoneNumber, parsePhoneNumberFromString, AsYouType } = require('libphonenumber-js');

/* ─────────────────────────────────────────────────
   VALIDATION / NORMALISATION
   ───────────────────────────────────────────────── */

function normalizePhone(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return { ok: false, error: 'Numero vide.' };

  const cleaned = input.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  if (!cleaned) return { ok: false, error: 'Aucun chiffre detecte.' };

  if (cleaned.startsWith('+')) {
    const parsed = parsePhoneNumber(cleaned);
    if (parsed && parsed.isValid()) return buildResult(parsed);
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8) return { ok: false, error: 'Trop court (8 chiffres minimum).' };
  if (digits.length > 15) return { ok: false, error: 'Trop long (15 chiffres maximum).' };

  const withPlus = parsePhoneNumberFromString('+' + digits);
  if (withPlus && withPlus.isValid()) return buildResult(withPlus);

  return {
    ok: true,
    number: digits,
    formatted: `+${digits}`,
    national: digits,
    country: null,
    type: 'unknown',
    warning: 'Validite pays non confirmee.'
  };
}

function buildResult(parsed) {
  return {
    ok: true,
    number: parsed.number.replace('+', ''),
    formatted: parsed.formatInternational(),
    national: parsed.formatNational(),
    country: parsed.country || null,
    type: parsed.getType() || 'unknown'
  };
}

/* ─────────────────────────────────────────────────
   SAISIE TEMPS RÉEL (mode raw)
   ───────────────────────────────────────────────── */

function promptPhoneRaw() {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY || !stdout.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question('Numero : ', (answer) => {
        rl.close();
        resolve(String(answer).replace(/\D/g, ''));
      });
      return;
    }

    let digits = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const redraw = () => {
      stdout.clearLine(0);
      stdout.cursorTo(0);
      if (!digits) { stdout.write('Numero : '); return; }
      const formatter = new AsYouType();
      const formatted = formatter.input('+' + digits);
      const country = formatter.getCountry();
      let line = `Numero : ${formatted}`;
      if (country) line += `  [${country}]`;
      stdout.write(line);
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = (chunk) => {
      for (const char of chunk) {
        const code = char.charCodeAt(0);

        if (code === 3) { // Ctrl+C
          cleanup(); stdout.write('\n'); process.exit(0);
        }

        if (char === '\r' || char === '\n') {
          cleanup(); stdout.write('\n'); resolve(digits); return;
        }

        if (char === '\x7f' || code === 8) { // Backspace
          if (digits.length > 0) { digits = digits.slice(0, -1); redraw(); }
          continue;
        }

        if (/\d/.test(char)) { digits += char; redraw(); }
      }
    };

    stdout.write('Numero : ');
    stdin.on('data', onData);
  });
}

function promptConfirm(label = 'Confirmer ? (o/n) : ') {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    if (!stdin.isTTY) {
      const readline = require('readline');
      const rl = readline.createInterface({ input: stdin, output: stdout });
      rl.question(label, (answer) => {
        rl.close();
        const a = String(answer).trim().toLowerCase();
        resolve(a === 'o' || a === 'oui' || a === 'y' || a === 'yes');
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdout.write(label);

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = (chunk) => {
      const raw = chunk.toString();
      const char = raw.toLowerCase();
      const code = raw.charCodeAt(0);

      if (code === 3) { cleanup(); stdout.write('\n'); process.exit(0); }
      if (char === 'o' || char === 'y') { cleanup(); stdout.write('oui\n'); resolve(true); }
      else if (char === 'n') { cleanup(); stdout.write('non\n'); resolve(false); }
    };

    stdin.on('data', onData);
  });
}

function digits(value) {
  return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

function pretty(value) {
  const d = digits(value);
  if (!d) return 'inconnu';
  return `+${d}`;
}

function jidToPhone(jid) {
  const s = String(jid || '');
  if (s.endsWith('@s.whatsapp.net')) return digits(s);
  if (/^\d{6,15}$/.test(s)) return s;
  return '';
}

function phoneOf(sock, meta, jid, ...alts) {
  const candidates = [jid, ...alts].filter(Boolean);
  const norm = (v) => String(v || '');

  // 1) JID téléphone direct
  for (const c of candidates) {
    const p = jidToPhone(c);
    if (p) return p;
  }

  // 2) Résolution via métadonnées groupe
  if (meta && Array.isArray(meta.participants)) {
    const all = candidates.map(c => norm(c).split('@')[0].split(':')[0]).filter(Boolean);
    for (const p of meta.participants) {
      const ids = [p.id, p.jid, p.lid, p.phoneNumber, p.pn].filter(Boolean).map(norm);
      const match = ids.some(id => {
        const n = id.split('@')[0].split(':')[0];
        return all.includes(n) || idsOfCompare(all, id);
      });
      if (!match) continue;
      for (const id of ids) {
        const ph = jidToPhone(id);
        if (ph) return ph;
      }
      if (p.phoneNumber) {
        const ph = digits(p.phoneNumber);
        if (ph) return ph;
      }
      if (p.pn) {
        const ph = digits(p.pn);
        if (ph) return ph;
      }
    }
  }

  // 3) Fallback: uniquement si ressemble à un numéro (pas un LID arbitraire)
  for (const c of candidates) {
    const s = norm(c);
    if (s.includes('@lid')) continue;
    const d = digits(s);
    if (d && d.length >= 8 && d.length <= 15) return d;
  }
  return '';
}

function idsOfCompare(all, id) {
  const n = String(id || '').split('@')[0].split(':')[0];
  return all.includes(n);
}

function displayPhone(sock, meta, jid, ...alts) {
  const p = phoneOf(sock, meta, jid, ...alts);
  return p ? `+${p}` : 'numéro inconnu';
}

module.exports = { normalizePhone, promptPhoneRaw, promptConfirm, phoneOf, pretty, digits, displayPhone, jidToPhone };
