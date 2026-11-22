'use strict';

const modes = new Map();

const getMode = (sessionId) => {
  return modes.get(sessionId) || 'public';
};

const setMode = (sessionId, mode) => {
  modes.set(sessionId, mode);
};

module.exports = { getMode, setMode };