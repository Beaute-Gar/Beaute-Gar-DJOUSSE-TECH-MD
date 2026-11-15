#!/usr/bin/env node
'use strict';
// Wrapper: lance les vérifications backend locales si disponibles.
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'backend', 'scripts', 'verify-setup.js'), ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
