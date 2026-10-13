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
app.enableShutdownHooks();
await app.listen(config.port);
