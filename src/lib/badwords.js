'use strict';

/**
 * DJOUSSE TECH MD — liste de mots et phrases interdits (français + anglais + sigles)
 *
 * Usage :
 *   const bw = require('./badwords');
 *   const hit = bw.check(texte);            // null ou { word, category }
 *   const hit = bw.check(texte, { only: ['grossier', 'sexuel'] });
 *   const hit = bw.check(texte, { skip: ['insultes_legeres'] });
 *
 * Détection : insensible aux majuscules, accents, lettres répétées (puuute),
 * chiffres/symboles (pu73, p@te), lettres espacées (p u t e, p.u.t.e),
 * et uniquement sur des mots entiers (« salopette » n'est pas détecté).
 */

const CATEGORIES = {
  // 1. Mots et paroles grossiers
  grossier: [
    'merde', 'merdeux', 'merdique', 'merdier', 
    'putain', 'putin', 'bordel',
    'chier', 'chieur', 'chieuse', 'va chier', 'chiasse',
    'ta gueule', 'ferme ta gueule', 
    'casse-toi', 'dégage connard', 'va te faire voir', 'va te faire foutre', 'va te faire enculer',
    'va te faire mettre', 'va te faire baiser', 'va te branler', 'va te pendre',
    'cul', 'trou du cul', 'trouduc', 'trou de balle', 'lèche-cul', 'faux cul',
    'couille', 'couilles', 'couillon', 'burne', 'burnes', 'je m\'en bats les couilles', 'je m\'en branle',
    'branleur', 'branleuse', 'branlette', 'branler', 'branlée',
    'pétasse', 'garce', 'radasse', 'grognasse', 'pouffiasse', 'traînée', 'catin', 'roulure',
    'fumier', 'raclure', 'ordure', 'pourriture', 'racaille', 'enfoiré', 'enfoirée', 'salaud', 'salopard', 'crapule',
    'sale chien', 'sale chienne', 'sale cochon', 'sale porc', 'sale truie', 
    'gros porc', 'grosse vache', 'grosse truie', 'face de rat', 'gueule de con', 'gueule de merde',
    'tête de con', 'tête de nœud', 'tête de cul', 
    'mange tes morts', 'mange ta merde', 'bouffe mes couilles',
    'connard', 'connards', 'connasse', 'conne', 'con', 'bâtard', 'bâtards', 'bâtarde'
  ],

  // 2. Vulgarités sexuelles
  sexuel: [
    'bite', 'zob', 'zgeg', 'teub', 'queutard', 'chatte', 'foufoune', 'nichon', 'nichons', 'nibard', 'nibards',
    'pute', 'putes', 'putasse', 'fils de pute', 'fille de pute', 'fils de putain', 'ta mère la pute', 'ta mère la chienne', 
    'salope', 'salopes', 
    'enculé', 'enculée', 'enculés', 'enculer', 'je t\'encule', 
    'nique', 'niquer', 'niqué', 'nique ta mère', 'nique ta race', 'nique ton père', 'nique tes morts', 'nique ta grand-mère', 'nique sa mère', 'nique ta famille', 'nique ta sœur', 'je te nique',
    'baise ta mère', 'baise-moi', 'baiseur', 'je vais te baiser', 'je te baise',
    'suceuse', 'suce-moi', 'pompeuse', 'tapineuse', 'chaudasse', 'allumeuse',
    'sodomie', 'sodomiser', 'éjaculer', 'sperme', 'gang bang', 'partouze', 'se masturber', 'branle-moi', 'fellation', 'cunnilingus', 'levrette', 'sextape', 'bukkake',
    'porno', 'pornographie', 'pornhub', 'xvideos', 'xnxx', 'youporn', 'xxx', 'nudes', 'envoie nudes', 'envoie des nudes', 'envoie ta photo nue',
    'montre tes seins', 'montre ton cul', 'sexto', 'sexting', 'plan cul', 'plan q', 'escort', 'onlyfans',
    'pédophile', 'pédophilie', 'violeur', 'je vais te violer', 'viol collectif'
  ],

  // 3. Insultes discriminatoires / haineuses
  haine: [
    'pédé', 'pédale', 'tapette', 'tarlouze', 'tantouze', 'tafiole', 'fiotte', 'lopette', 'travelo', 'gouine', 'sale homo',
    'nègre', 'négro', 'sale noir', 'sale nègre', 'bamboula', 'retourne en afrique', 'retourne dans ton pays', 'retourne dans ta brousse',
    'bougnoule', 'bicot', 'raton', 'sale arabe', 'sale beur', 'crouille', 'sale musulman', 'sale islamiste',
    'youpin', 'youtre', 'sale juif', 'sale feuj', 'sale boche', 'sale blanc', 'sale toubab',
    'chinetoque', 'niakoué', 'sale chinois', 'sale rom', 'sale tsigane',
    'mongol', 'mongolien', 'attardé', 'débile mental', 'sous-race', 'sale race', 'race inférieure', 'race de merde',
    'sale étranger', 'sale immigré', 'sale africain', 'nique les noirs', 'nique les arabes', 'nique les blancs', 'nique les juifs',
    'mort aux arabes', 'mort aux noirs', 'mort aux juifs', 'mort aux pédés', 'heil hitler', 'sieg heil', 'white power'
  ],

  // 4. Insultes plus légères (désactivables avec { skip: ['insultes_legeres'] })
  insultes_legeres: [
    'abruti', 'abrutie', 'crétin', 'crétine', 'imbécile', 'idiot', 'idiote', 'débile', 'andouille', 'blaireau',
    'minable', 'pauvre con', 'pauvre type', 'sombre idiot', 'sombre crétin', 'sombre con', 'triple buse', 'tocard',
    'gros nul', 'sale menteur', 'cas social', 'clochard de merde', 'ferme-la', 'ferme la', 'mougou'
  ],

  // 5. Menaces et harcèlement
  menaces: [
    'va mourir', 'va crever', 'crève', 'crève salope', 'crève connard', 'j\'espère que tu crèves', 'tu vas crever', 'tu vas mourir',
    'suicide-toi', 'tue-toi', 'va te suicider', 'va te tuer', 'pends-toi', 'kys', 'kill yourself', 'go kill yourself', 'go die',
    'je vais te tuer', 'je vais te buter', 'je vais te crever', 'je vais te défoncer', 'je vais t\'égorger', 'je vais te massacrer',
    'je vais te casser la gueule', 'je vais te retrouver', 'je sais où tu habites', 'je vais brûler ta maison', 'je vais tuer ta famille',
    'je vais te faire la peau', 'je vais t\'éclater', 'prépare ton cercueil', 'ta famille va payer', 'ta mère va mourir'
  ],

  // 6. Grossièretés et insultes anglaises
  anglais: [
    'fuck', 'fucking', 'fucker', 'fucked', 'fuck you', 'fuck off', 'motherfucker', 'mofo', 'mfer',
    'shit', 'shitty', 'bullshit', 'shithead', 'eat shit', 'piece of shit', 'dipshit',
    'bitch', 'bitches', 'son of a bitch', 'asshole', 'jackass', 'dumbass',
    'dick', 'dickhead', 'cock', 'cocksucker', 'suck my dick', 'prick', 'pussy', 'cunt', 'twat', 'wanker', 'douchebag',
    'whore', 'slut', 'skank', 'bastard', 'scumbag',
    'cumshot', 'blowjob', 'handjob', 'jerk off', 'dildo',
    'nigger', 'nigga', 'faggot', 'fag', 'dyke', 'tranny', 'retard', 'retarded', 'spic', 'chink', 'gook', 'kike', 'wetback', 'towelhead',
    'go to hell', 'rot in hell', 'shut the fuck up'
  ],

  // 7. Sigles et abréviations
  sigles: [
    'ntm', 'ntmm', 'nsm', 'nstm', 'nik ta mer', 'nik ta mere', 'nik omok', 'nkm',
    'fdp', 'fdpt', 'tg', 'ftg', 'tgg', 'pd', 'ptn', 'ptin', 'pttn', 'ptnn', 'pt1', 'ptain',
    'mrd', 'mrde', 'mrdr', 'cnrd', 'cnard', 'cnnrd', 'cnasse', 'cnnasse', 'slp', 'slpe', 'slpr',
    'bzr', 'btrd', 'btard', 'ncl', 'nclc', 'ncul',
    'tchoin', 'tchouin', 'tasspé', 'kahba', 'qahba', '9ahba', 'zamel', 'ya kelb', 'ibn el kelb', 'zebi',
    'wtf', 'stfu', 'gtfo', 'smd', 'fk', 'fck', 'fuk', 'fcuk', 'biatch', 'btch', 'dck'
  ]
};

/* ---------- normalisation ---------- */

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '€': 'e', '¡': 'i' };

function stripAccents(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

// "p u t e", "p.u.t.e", "p-u-t-e" => "pute"
function joinSpaced(s) {
  return s.replace(/(?:^|[^a-z0-9])((?:[a-z0-9][ .\-_*]){2,}[a-z0-9])(?![a-z0-9])/g, (m, g) => m.replace(g, g.replace(/[ .\-_*]/g, '')));
}

function normalizeText(raw) {
  let s = stripAccents(raw);
  s = s.replace(/[’‘`´]/g, '\'');
  s = joinSpaced(s);
  s = s
    .split(/[\s]+/)
    .map((tok) => {
      if (!/[a-z]/.test(tok)) return tok; // numéros de téléphone, etc. : on ne touche pas
      return tok.replace(/[0-9@$€¡]/g, (c) => LEET[c] || c).replace(/\*/g, '');
    })
    .join(' ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/(.)\1+/g, '$1'); // lettres répétées : puuute -> pute, connard -> conard
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeEntry(e) {
  return normalizeText(e);
}

/* ---------- compilation ---------- */

const compiled = [];

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compile() {
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    const map = new Map(); // forme normalisée -> entrée d'origine
    for (const w of list) {
      const n = normalizeEntry(w);
      if (n && !map.has(n)) map.set(n, w);
    }
    const forms = [...map.keys()].sort((a, b) => b.length - a.length);
    if (!forms.length) continue;
    const re = new RegExp('(?:^| )(' + forms.map((f) => esc(f).replace(/ /g, ' ')).join('|') + ')(?= |$)');
    compiled.push({ cat, re, map });
  }
}
compile();

/**
 * Retourne null ou { word, category, matched }.
 * options.only : ne garder que ces catégories ; options.skip : en ignorer.
 */
function check(text, options) {
  const opt = options || {};
  const s = normalizeText(text);
  if (!s) return null;
  for (const c of compiled) {
    if (opt.only && !opt.only.includes(c.cat)) continue;
    if (opt.skip && opt.skip.includes(c.cat)) continue;
    const m = c.re.exec(s);
    if (m) return { word: c.map.get(m[1]) || m[1], category: c.cat, matched: m[1] };
  }
  return null;
}

function all(options) {
  const opt = options || {};
  const out = [];
  for (const [cat, list] of Object.entries(CATEGORIES)) {
    if (opt.only && !opt.only.includes(cat)) continue;
    if (opt.skip && opt.skip.includes(cat)) continue;
    out.push(...list);
  }
  return [...new Set(out)];
}

module.exports = { CATEGORIES, check, all, normalizeText };
