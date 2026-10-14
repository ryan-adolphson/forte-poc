import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import type { AssistantSettingsResponse, ChatProviderId, UpdateAssistantSettingsRequest } from '@forte/chat-contract';
import { IsIn, IsString, Length } from 'class-validator';
import { AssistantSettingsResolver } from './assistant-settings.js';
import { PROVIDER_IDS } from './models.js';

export class UpdateAssistantSettingsDto implements UpdateAssistantSettingsRequest {
  @IsIn(PROVIDER_IDS)
  provider!: ChatProviderId;

  @IsString()
  @Length(1, 100)
  model!: string;
}

/**
 * The app-wide assistant setting (one for everyone). Behind the global session guard like
 * every route; not rate limited.
 */
@Controller('settings/assistant')
export class AssistantSettingsController {
  constructor(@Inject(AssistantSettingsResolver) private readonly assistant: AssistantSettingsResolver) {}

  @Get()
  get(): Promise<AssistantSettingsResponse> {
    return this.assistant.response();
  }

  /** 400 `invalid_setting` (`SettingsErrorBody`) when the model or provider cannot be used. */
  @Put()
  put(@Body() body: UpdateAssistantSettingsDto): Promise<AssistantSettingsResponse> {
    return this.assistant.save(body);
  }
}
