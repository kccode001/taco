import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService } from './voice.service';

@Controller('visits/:visitId')
@UseGuards(AuthGuard('jwt'))
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  // AC-6 — voice-first capture: rep records, FE polls voice-summary while we
  // run Whisper → Sonnet summarization in the background.
  @Post('voice-recording')
  @UseInterceptors(FileInterceptor('audio'))
  uploadRecording(
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.voice.uploadRecording(visitId, file);
  }

  @Get('voice-summary')
  getSummary(@Param('visitId', ParseUUIDPipe) visitId: string) {
    return this.voice.getSummary(visitId);
  }
}
