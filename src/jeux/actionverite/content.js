'use strict';

// Source des défis et vérités. Ordre : IA -> liste locale -> générateur combinatoire.
const crypto = require('crypto');
const adult = require('./adultGen');

const used = new Map(); // chatId -> Set de hash déjà sortis

const hashOf = (t) => crypto.createHash('sha1').update(String(t).toLowerCase()).digest('hex').slice(0, 12);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LOCAL = {
  dare: {
    soft: [
      'Envoie un vocal où tu dis « je t\'aime » à ton plat préféré avec la voix la plus romantique possible.',
      'Écris un petit poème de 2 lignes pour la personne qui a parlé juste avant toi.',
      'Envoie un vocal en chantant le refrain d\'une chanson d\'amour de ton choix.',
      'Décris en un message ton premier rendez-vous idéal.',
      'Envoie un compliment sincère à trois membres du groupe, un par un.',
      'Imite en vocal la façon dont tu dragues quelqu\'un, sans te prendre au sérieux.'
    ],
    hot: [
      'Envoie un vocal chuchoté pour dire bonne nuit à la personne de ton choix dans le groupe.',
      'Raconte en vocal le moment où tu as été le plus troublé(e) par quelqu\'un.',
      'Écris le message de séduction le plus audacieux que tu pourrais envoyer à ton crush.',
      'Envoie un vocal avec ta voix la plus sensuelle pour lire le message de ta dernière notification.',
      'Dis en vocal quelle qualité physique tu remarques en premier chez quelqu\'un.',
      'Décris en un message ton baiser idéal, avec l\'ambiance et le lieu.'
    ],
    extreme: [
      'Avoue en vocal ta plus grosse folie d\'une nuit dont tu peux parler sans gêne.',
      'Écris ton message d\'accroche le plus osé, tel que tu l\'enverrais à quelqu\'un qui te plaît vraiment.',
      'Envoie un vocal où tu décris ta tenue la plus séduisante, détails à l\'appui.',
      'Dis en vocal avec qui du groupe tu aurais le plus de chimie, et pourquoi.',
      'Raconte le moment le plus gênant et le plus excitant de ta vie amoureuse.'
    ]
  },
  truth: {
    soft: [
      'Quelle est la chose la plus romantique que tu aies faite pour quelqu\'un ?',
      'Quel est ton plus grand coup de cœur d\'adolescence ?',
      'Quel est le défaut que tu supportes le moins chez quelqu\'un qui te plaît ?',
      'As-tu déjà eu un crush sur quelqu\'un de ce groupe ?',
      'Quelle est la phrase de drague la plus nulle que tu aies entendue ?',
      'Quel est le plus beau compliment qu\'on t\'ait fait ?'
    ],
    hot: [
      'Quelle est la première chose que tu remarques chez quelqu\'un qui te plaît ?',
      'Quel est ton plus beau souvenir de baiser ?',
      'Quel est le lieu le plus insolite où tu as flirté ?',
      'As-tu déjà envoyé un message que tu as regretté à cause d\'un crush ?',
      'Quel est ton plus grand point faible face à la séduction ?',
      'Qu\'est-ce qui te fait craquer instantanément chez quelqu\'un ?'
    ],
    extreme: [
      'Quelle est ta plus grande fantaisie dont tu peux parler sans rougir ?',
      'Quelle est la chose la plus audacieuse que tu aies faite pour séduire ?',
      'Quel est le moment de ta vie amoureuse dont tu es le plus fier(e) ?',
      'Quelle est la rencontre la plus intense que tu aies vécue en une soirée ?',
      'Quelle est la chose la plus osée que tu aimerais essayer au moins une fois ?'
    ]
  }
};

const PARTS = {
  dare: {
    start: ['Envoie un vocal', 'Écris un message', 'Fais un vocal', 'Raconte en un message', 'Improvise en vocal'],
    topic: [
      'où tu avoues ton plus grand crush',
      'où tu décris ton rendez-vous idéal',
      'où tu fais un compliment à la dernière personne qui a parlé',
      'où tu imites ta façon de séduire',
      'où tu dis ce qui te fait craquer chez quelqu\'un',
      'où tu racontes ton souvenir le plus gênant en amour'
    ],
    end: ['avec une voix très romantique.', 'en riant de toi-même.', 'sans te reprendre.', 'comme si c\'était un film.', 'en 20 secondes maximum.']
  },
  truth: {
    start: ['Quel est', 'Peux-tu dire quel est', 'Raconte quel est', 'Avoue quel est'],
    topic: [
      'ton plus grand secret en amour',
      'ton pire râteau',
      'le plus beau compliment que tu aies reçu',
      'ton type de personne idéal',
      'ton plus gros coup de cœur secret',
      'le moment où tu as été le plus troublé(e)'
    ],
    end: ['?', ' et pourquoi ?', ' de ces derniers mois ?', ' sans mentir ?']
  }
};

function generateLocal(kind) {
  const p = PARTS[kind];
  const t = pick(p.topic);
  const e = pick(p.end);
  return pick(p.start) + ' ' + t + (e.startsWith('?') || e.startsWith(' ') ? e : ' ' + e);
}

function seenSet(chatId) {
  if (!used.has(chatId)) used.set(chatId, new Set());
  return used.get(chatId);
}

/**
 * kind : 'dare' | 'truth'   level : 'soft' | 'hot' | 'extreme'
 * Retourne { text, source } avec source = 'ia' | 'local' | 'genere'
 */
async function get(kind, level, chatId) {
  const seen = seenSet(chatId);
  const lvl = LOCAL[kind][level] ? level : 'soft';
  const mark = (t) => {
    seen.add(hashOf(t));
    if (seen.size > 400) seen.clear();
  };

  if (adult.enabled()) {
    for (let i = 0; i < 2; i++) {
      try {
        const text = await adult.generate(kind, lvl, chatId);
        if (!seen.has(hashOf(text))) {
          mark(text);
          return { text, source: 'ia' };
        }
      } catch (e) {
        console.error('[actionverite] IA indisponible:', e.message);
        break;
      }
    }
  }

  const pool = LOCAL[kind][lvl].filter((t) => !seen.has(hashOf(t)));
  if (pool.length) {
    const text = pick(pool);
    mark(text);
    return { text, source: 'local' };
  }

  for (let i = 0; i < 40; i++) {
    const text = generateLocal(kind);
    if (!seen.has(hashOf(text))) {
      mark(text);
      return { text, source: 'genere' };
    }
  }
  seen.clear();
  const text = generateLocal(kind);
  mark(text);
  return { text, source: 'genere' };
}

module.exports = { get, hashOf };
