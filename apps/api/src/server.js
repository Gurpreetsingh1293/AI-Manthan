import { config } from './config.js';
import { createApp } from './app.js';

const server = createApp(config).listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
server.on('error', (error) => { console.error(error.message); process.exit(1); });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
