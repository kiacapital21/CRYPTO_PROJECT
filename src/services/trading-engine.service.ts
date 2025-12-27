import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderService } from './order.service';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { FundingService } from 'src/funding/funding.service';
@Injectable()
export class TradingEngineService {
  private logger = new Logger(TradingEngineService.name);
  constructor(
    private readonly orders: OrderService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly fundingService: FundingService,
  ) {}

  fundingThreshold = 0.6; // 0.6% funding rate threshold

  async runMorningStrategy() {
    // fire-and-forget emitAsync (don't await listeners)
    void this.eventEmitter.emitAsync('ws.stop').catch((err) => {
      this.logger.warn('ws.stop emit error', err);
    });
    const rates = await this.fundingService.getLatestFundingRates();
    this.logger.log('Funding rates for strategy:', rates);
    const filtered = rates.filter(
      (r) =>
        r.fundingRate <= -this.fundingThreshold ||
        r.fundingRate >= this.fundingThreshold,
    );

    if (filtered.length === 0) {
      this.logger.log('************ALERT*********************');
      this.logger.log('No funding rates met the trading criteria.');
      this.logger.log('************./END OF ALERT*********************');
      return;
    }
    this.logger.log('Filtered funding rates for trading:', filtered);

    const selected = filtered.reduce((a, b) =>
      Math.abs(b.fundingRate) > Math.abs(a.fundingRate) ? b : a,
    );

    this.logger.log('Selected symbol for trading:', selected);
    let symbol = selected.symbol;
    // let symbol = 'MOVEUSD';
    const cacheCrypto = await this.cache.get<string>('tradingCrypto');
    this.logger.log(`Cached trading crypto: ${cacheCrypto}`);
    // const cryptoInCache = await this.cache.get<string>('tradingCrypto');
    if (cacheCrypto) {
      symbol = cacheCrypto;
    }
    this.logger.log(`Placing buy order for ${symbol}...`);
    // if (selected.fundingRate <= -this.fundingThreshold) {
    //   await this.orders.buy(symbol);
    // } else {
    //   await this.orders.buy(symbol);
    // }
    this.logger.log('Ending morning trading strategy...');
    this.logger.log('************ALERT*********************');
    this.logger.log('Trading completed.');
    this.logger.log('************./END OF ALERT*********************');
    return 'selected';
  }

  async runLocalStrategy() {
    // fire-and-forget emitAsync (don't await listeners)
    void this.eventEmitter.emitAsync('ws.stop').catch((err) => {
      this.logger.warn('ws.stop emit error', err);
    });
    let symbol = process.env.SYMBOL || '';
    const cacheCrypto = await this.cache.get<string>('tradingCrypto');
    this.logger.log(`Cached trading crypto: ${cacheCrypto}`);
    if (cacheCrypto) {
      symbol = cacheCrypto;
    }
    await this.orders.buy(symbol);
    // await this.orders.sell(symbol);
    this.logger.log('Ending local trading strategy...');
    this.logger.log('************ALERT*********************');
    this.logger.log('Trading completed.');
    this.logger.log('************./END OF ALERT*********************');
    return 'selected';
  }

  // async placeStopLoss() {
  //   const response = await this.orders.runStopLoss();
  //   void this.eventEmitter.emitAsync('ws.start').catch((err) => {
  //     this.logger.warn('ws.start emit error', err);
  //   });
  //   return response;
  // }
}
