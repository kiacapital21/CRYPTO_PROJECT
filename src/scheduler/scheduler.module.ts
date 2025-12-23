// scheduler.module.ts
import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { FundingService } from 'src/funding/funding.service';
import { OrderService } from 'src/services/order.service';
import { TradingEngineService } from 'src/services/trading-engine.service';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';
import { DeltaExchangeModule } from 'src/deltaExchange/delta-exchange.module';
import { HttpModule } from '@nestjs/axios';
import { WsModule } from 'src/websocket/ws.module';

@Module({
  providers: [
    SchedulerService,
    TradingEngineService,
    FundingService,
    OrderService,
    DeltaExchangeService,
  ],
  exports: [
    SchedulerService,
    TradingEngineService,
    FundingService,
    OrderService,
    DeltaExchangeService,
  ],
  imports: [DeltaExchangeModule, HttpModule, WsModule],
})
export class SchedulerModule {}
