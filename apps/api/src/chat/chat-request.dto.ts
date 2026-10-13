import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, MaxLength } from 'class-validator';
import type { ChatRequest } from '@forte/chat-contract';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class ChatRequestDto implements ChatRequest {
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  previousInteractionId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 64)
  productSku?: string;
}
