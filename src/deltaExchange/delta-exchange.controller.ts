// delta-exchange.controller.ts
import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { DeltaExchangeService } from './delta-exchange.service';

@Controller('delta-exchange')
export class DeltaExchangeController {
  constructor(private readonly deltaExchangeService: DeltaExchangeService) {}

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

  // @Get('positions')
  // async getPositions() {
  //   return this.deltaExchangeService.getPositions();
  // }
}
