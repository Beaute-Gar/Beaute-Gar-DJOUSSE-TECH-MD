'use strict';

const fs = require('fs');
const path = require('path');

const commands = new Map();
const defaultCommands = ['menu', 'kick'];

const findCommand = (rawName) => {
  return commands.get(rawName.toLowerCase());
};

const loadCommands = () => {
  // Default commands are handled elsewhere
  // This is a placeholder for dynamic command loading
};

module.exports = { findCommand, loadCommands, commands, defaultCommands };