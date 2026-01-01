// delta-exchange.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BinanceService } from './binance.service';
import { BinanceController } from './binance.controller';
import { DelayService } from 'src/services/delay.service';
import { BinanceSchedulerService } from './binance.scheduler.service';
import { WsModule } from 'src/websocket/ws.module';

@Module({
  imports: [HttpModule, ConfigModule, WsModule],
  providers: [BinanceService, DelayService, BinanceSchedulerService],
  exports: [BinanceService],
  controllers: [BinanceController],
})
export class BinanceModule {}
