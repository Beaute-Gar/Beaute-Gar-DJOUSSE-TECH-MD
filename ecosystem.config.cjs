module.exports = {
  apps: [
    {
      name: 'dte-bot',
      cwd: __dirname,
      script: 'index.js',
      node_args: '--max-old-space-size=1024',
      max_memory_restart: '1200M',
      autorestart: true,
      min_uptime: '30s',
      max_restarts: 20,
      exp_backoff_restart_delay: 2000,
      kill_timeout: 15000,
      env: { NODE_ENV: 'production' }
    }
  ]
};
