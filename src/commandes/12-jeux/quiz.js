'use strict';

const style = require('../../config/style');
const quiz = require('../../jeux/quiz');

module.exports = {
  name: 'quiz',
  aliases: ['quizz', 'startquiz', 'quizstop', 'stopquiz', 'quizscore', 'quizscores', 'classementquiz', 'topquiz', 'quizcat', 'quizcategories'],
  category: 'jeux',
  description: 'Quiz en direct : questions, points, classement',
  async execute(sock, m, from, args) {
    try {
      if (await quiz.handleMessage(sock, m)) return;
    } catch (e) {
      console.error('[quiz] stub:', e.message);
    }
    await sock.sendMessage(from, {
      text: style.box('QUIZ', [
        'Utilisez :',
        '.quiz [nombre] [categorie]',
        '.quizstop',
        '.quizscore',
        '.quizcat'
      ])
    }, { quoted: m }).catch(() => {});
  }
};
