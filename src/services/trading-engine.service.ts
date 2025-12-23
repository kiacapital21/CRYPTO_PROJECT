import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FundingService } from '../funding/funding.service';
import { OrderService } from './order.service';

@Injectable()
export class TradingEngineService {
  constructor(
    private readonly fundingService: FundingService,
    private readonly orders: OrderService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  fundingThreshold = 0.1;

  async runMorningStrategy() {
    console.log(
      new Date().toISOString(),
      'Starting morning trading strategy...',
    );
    // fire-and-forget emitAsync (don't await listeners)
    void this.eventEmitter.emitAsync('ws.stop').catch((err) => {
      console.warn('ws.stop emit error', err);
    });
    console.log(
      new Date().toISOString(),
      'WebSocket stopped for trading strategy.',
    );
    // const rates = await this.fundingService.getLatestFundingRates();
    // console.log('Funding rates for strategy:', rates);
    // const filtered = rates.filter(
    //   (r) =>
    //     r.fundingRate <= -this.fundingThreshold ||
    //     r.fundingRate >= this.fundingThreshold,
    // );

    // if (filtered.length === 0) {
    //   console.log('************ALERT*********************');
    //   console.log('No funding rates met the trading criteria.');
    //   console.log('************./END OF ALERT*********************');
    //   return;
    // }
    // console.log('Filtered funding rates for trading:', filtered);

    // const selected = filtered.reduce((a, b) =>
    //   Math.abs(b.fundingRate) > Math.abs(a.fundingRate) ? b : a,
    // );

    // console.log('Selected symbol for trading:', selected);
    // let symbol = selected.symbol;
    let symbol = 'SONICUSD';
    // if (selected.fundingRate <= -this.fundingThreshold) {
    // await this.orders.buy(symbol);
    // } else {
    await this.orders.buy(symbol);
    // }

    //wait for 1 minute before logging trading completed
    // await new Promise((resolve) => setTimeout(resolve, 30000));
    // if (selected.fundingRate <= -this.fundingThreshold) {
    // await this.orders.sell(symbol);
    // } else {
    //   await this.orders.buy(symbol);
    // }
    console.log(new Date().toISOString(), 'Ending morning trading strategy...');
    console.log('************ALERT*********************');
    console.log('Trading completed.');
    console.log('************./END OF ALERT*********************');
    // fire-and-forget start
    void this.eventEmitter.emitAsync('ws.start').catch((err) => {
      console.warn('ws.start emit error', err);
    });
    return 'selected';
  }

  async placeStopLoss() {
    console.log(new Date().toISOString(), 'Placing stop loss order...');
    const response = await this.orders.runStopLoss();
    console.log(new Date().toISOString(), 'Stop loss order placed.');
    return response;
  }
}
