import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp({ logger: { level: config.LOG_LEVEL } });

app.listen({ port: config.PORT, host: config.HOST }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
