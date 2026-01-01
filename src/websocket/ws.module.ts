import { Module } from '@nestjs/common';
import { DeltaWsService } from './delta-ws.service';
import { BinanceWsService } from './binance-ws.service';

@Module({
  providers: [DeltaWsService, BinanceWsService],
  exports: [DeltaWsService, BinanceWsService],
})
export class WsModule {}
