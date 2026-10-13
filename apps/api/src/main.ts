import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { appConfig, type AppConfig } from './config/app.config.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
const config = app.get<AppConfig>(appConfig.KEY);
// Behind a reverse proxy, `req.ip` (the rate-limit key) comes from X-Forwarded-For.
app.set('trust proxy', config.trustProxy);
configureApp(app);
const missing = [
  config.authUsername === undefined ? 'AUTH_USERNAME' : null,
  config.authPassword === undefined ? 'AUTH_PASSWORD' : null,
].filter((name) => name !== null);
if (missing.length > 0) {
  new Logger('Auth').warn(`${missing.join(' and ')} not set: nobody can sign in, and every data and chat route answers 401.`);
}
app.enableShutdownHooks();
await app.listen(config.port);
