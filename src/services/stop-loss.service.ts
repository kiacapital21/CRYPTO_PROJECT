import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import EventEmitter2 from 'eventemitter2';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';

@Injectable()
export class StopLossService {
  private readonly logger = new Logger(StopLossService.name);
  private readonly STOP_LOSS_PERCENTAGE = 0.003; // 0.3% stop loss
  private readonly STOP_LOSS_CACHE_KEY = 'stopLossRequest';
  private readonly STOP_LOSS_EVENT = 'stopLossRequestCached';
  constructor(
    private deltaExchangeService: DeltaExchangeService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private eventEmitter: EventEmitter2,
  ) {}
  async cacheStopLossRequest(
    productId: number,
    side: string,
    averageFillPrice: number,
    maxSize: number,
    symbol: string,
  ) {
    const stopLossPrice = this.calculateStopLossPrice(averageFillPrice, side);
    this.logger.log('Calculated stop loss price:', stopLossPrice);

    const stopLossRequest = {
      product_id: productId,
      side: side === 'buy' ? 'sell' : 'buy',
      size: maxSize,
      stop_price: stopLossPrice,
      order_type: 'market_order',
      reduce_only: true,
    };

    await this.cache.set(this.STOP_LOSS_CACHE_KEY, stopLossRequest);
    this.logger.log('Stop loss order request cached');

    // Emit event
    this.eventEmitter.emit(this.STOP_LOSS_EVENT, {
      product_id: productId,
      symbol: symbol,
    });
  }

  private calculateStopLossPrice(
    averageFillPrice: number,
    side: string,
  ): string {
    const adjustment = averageFillPrice * this.STOP_LOSS_PERCENTAGE;
    return (
      side === 'sell'
        ? averageFillPrice + adjustment
        : averageFillPrice - adjustment
    ).toString();
  }

  async runStopLoss() {
    let stopLossReq = await this.cache.get(this.STOP_LOSS_CACHE_KEY);

    if (!stopLossReq) {
      this.logger.log('Waiting for stop loss request from cache...');
      stopLossReq = await this.waitForStopLossRequest();
    }

    this.logger.log('Placing stop loss order...');
    const stopLossOrderResponse =
      await this.deltaExchangeService.placeOrder(stopLossReq);

    this.logger.log('Stop loss order placed.');
    await this.cache.del(this.STOP_LOSS_CACHE_KEY);

    return stopLossOrderResponse;
  }

  private waitForStopLossRequest(): Promise<any> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.eventEmitter.removeListener(this.STOP_LOSS_EVENT, eventHandler);
        this.logger.error('Stop loss request timeout');
        resolve(null);
      }, 30000); // 30 second timeout

      const eventHandler = async () => {
        clearTimeout(timeout);
        const req = await this.cache.get(this.STOP_LOSS_CACHE_KEY);
        resolve(req);
      };

      this.eventEmitter.once(this.STOP_LOSS_EVENT, eventHandler);
    });
  }
}
