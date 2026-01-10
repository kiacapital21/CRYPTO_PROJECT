import { Module } from '@nestjs/common';
import { DeltaWsService } from './delta-ws.service';
import { BinanceWsService } from './binance-ws.service';
import { FundingState } from './funding-state';
import { BinanceUserWsService } from './binance-user-ws.service';
import { ListenKeyService } from './listen-key.service';

@Module({
  providers: [
    DeltaWsService,
    BinanceWsService,
    BinanceUserWsService,
    FundingState,
    ListenKeyService,
  ],
  exports: [
    DeltaWsService,
    BinanceWsService,
    BinanceUserWsService,
    FundingState,
    ListenKeyService,
  ],
})
export class WsModule {}
