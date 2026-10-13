import { IsString, Length } from 'class-validator';
import type { LoginRequest } from '@forte/chat-contract';

export class LoginDto implements LoginRequest {
  @IsString()
  @Length(1, 200)
  username!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}
