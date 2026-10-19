module.exports = {
  apps: [
    {
      name: 'kari-packing-os',
      script: 'dist/server.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      ignore_watch: [
        'node_modules',
        'public',
        'uploads',
        'dist/uploads',
        'server/*.json',
        'server/*.db',
        'server/*.db-journal',
        'server/*.db-wal',
        '.git'
      ],
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};

