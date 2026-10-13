import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { appConfig, type AppConfig } from './config/app.config.js';
import { configureApp } from './configure-app.js';

const app = await NestFactory.create(AppModule);
configureApp(app);
app.enableShutdownHooks();
await app.listen(app.get<AppConfig>(appConfig.KEY).port);
