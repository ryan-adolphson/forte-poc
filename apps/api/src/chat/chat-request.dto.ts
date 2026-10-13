import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { ChatRequest } from '@forte/chat-contract';

export class ChatRequestDto implements ChatRequest {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousInteractionId?: string;
}
