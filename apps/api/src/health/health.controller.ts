import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/session.guard.js';

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
