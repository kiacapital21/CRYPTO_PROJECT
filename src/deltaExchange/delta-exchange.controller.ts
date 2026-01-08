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
import { DeltaExchangeService } from './delta-exchange.service';
import { SchedulerService } from 'src/scheduler/scheduler.service';

@Controller('delta-exchange')
export class DeltaExchangeController {
  private logger = new Logger(DeltaExchangeController.name);
  constructor(
    private readonly deltaExchangeService: DeltaExchangeService,
    private readonly schedulerService: SchedulerService,
  ) {}

  @Get('ping')
  async ping() {
    this.logger.log('Pinging Delta Exchange API');
    return 'pong';
  }

  @Get('orders')
  async getOrders(@Query('product_id') productId?: string) {
    const id = productId ? parseInt(productId) : undefined;
    return this.deltaExchangeService.getOpenOrders(id);
  }

  // @Post('orders')
  // async placeOrder(@Body() orderData: any) {
  //   return this.deltaExchangeService.placeOrder(orderData);
  // }

  // @Get('wallet')
  // async getWallet() {
  //   return this.deltaExchangeService.getWallet();
  // }

  @Get('get-crypto')
  async getCrypto() {
    return this.deltaExchangeService.getCrypto();
  }

  @Post('set-crypto')
  async setCrypto(@Body('symbol') symbol: string) {
    return this.deltaExchangeService.setCrypto(symbol);
  }

  @Delete('clear-crypto')
  async clearCrypto() {
    return this.deltaExchangeService.clearCrypto();
  }

  @Post('stop-service')
  async stopService() {
    return this.schedulerService.stopAll();
  }

  @Post('start-service')
  async startService() {
    return this.schedulerService.startAll();
  }

  @Get('status')
  async status() {
    const status = this.schedulerService.status();
    console.log('Status:', status);
    return status;
  }
}
