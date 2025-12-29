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

@Controller('binance')
export class BinanceController {
  private logger = new Logger(BinanceController.name);
  constructor(private readonly binanceService: BinanceService) {}

  @Get('ping')
  async ping() {
    this.logger.log('Pinging Binance API');
    return 'pong';
  }

  @Get('markPrice')
  async getMarkPrice() {
    return this.binanceService.getMarkPrice();
  }

  // @Post('orders')
  // async placeOrder(@Body() orderData: any) {
  //   return this.binanceService.placeOrder(orderData);
  // }

  // @Get('wallet')
  // async getWallet() {
  //   return this.binanceService.getWallet();
  // }

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
}
