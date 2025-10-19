module.exports = {
  apps: [
    {
      name: 'lighter-asterdx-42ec-86b3',
      script: './lighter-aster-real-bot.ts',
      interpreter: 'node',
      interpreter_args: '--loader ts-node/esm',
      env: {
        NODE_ENV: 'production',
        TS_NODE_ESM: 'true'
      },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/lighter-aster-error.log',
      out_file: './logs/lighter-aster-out.log',
      log_file: './logs/lighter-aster-combined.log',
      time: true,
      merge_logs: true
    },
    {
      name: 'edgex-paradex-arbitrage',
      script: './src/simple-edgex-paradex-bot.ts',
      interpreter: 'npx',
      interpreter_args: 'tsx',
      env: {
        NODE_ENV: 'production',
        TRADE_AMOUNT: '0.03',
        OPEN_THRESHOLD: '150',
        CLOSE_THRESHOLD: '70',
        CHECK_INTERVAL: '5000'
      },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/edgex-paradex-simple-error.log',
      out_file: './logs/edgex-paradex-simple-out.log',
      log_file: './logs/edgex-paradex-simple-combined.log',
      time: true,
      merge_logs: true
    }
  ]
};