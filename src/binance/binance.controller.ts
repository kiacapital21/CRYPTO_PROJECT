// delta-exchange.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Delete,
  Logger,
} from '@nestjs/common';
import { BinanceService } from './binance.service';
import { BinanceSchedulerService } from './binance.scheduler.service';

@Controller('binance')
export class BinanceController {
  private logger = new Logger(BinanceController.name);
  constructor(
    private readonly binanceService: BinanceService,
    private readonly binanceSchedulerService: BinanceSchedulerService,
  ) {}

  @Get('ping')
  async ping() {
    this.logger.log('Pinging Binance API');
    return 'pong';
  }

  @Get('markPrice')
  async getMarkPrice() {
    return this.binanceService.getMarkPrice();
  }

  @Get('get-crypto')
  async getCrypto() {
    return this.binanceService.getCrypto();
  }

  @Post('set-crypto')
  async setCrypto(@Body('symbol') symbol: string) {
    return this.binanceService.setCrypto(symbol);
  }

  @Delete('clear-crypto')
  async clearCrypto() {
    return this.binanceService.clearCrypto();
  }

  @Post('stop-service')
  async stopService() {
    return this.binanceSchedulerService.stopAll();
  }

  @Post('start-service')
  async startService() {
    return this.binanceSchedulerService.startAll();
  }

  @Get('status')
  async status() {
    return this.binanceSchedulerService.status();
  }
}
