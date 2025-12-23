import { Module } from '@nestjs/common';
import { DeltaWsService } from './delta-ws.service';

@Module({
  providers: [DeltaWsService],
  exports: [DeltaWsService],
})
export class WsModule {}
