import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginThrottlerGuard } from './login-throttler.guard.js';
import { SessionGuard } from './session.guard.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginThrottlerGuard,
    // Global: every route in the app needs a session unless it is marked @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
