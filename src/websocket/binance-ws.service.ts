import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import WebSocket from 'ws';

interface BookTickerCache {
  bid: number;
  ask: number;
  eventTime: number;
  quantity: number;
}

@Injectable()
export class BinanceWsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceWsService.name);
  private ws: WebSocket | null = null;

  private tickerCache: Map<string, BookTickerCache> = new Map();

  onModuleInit() {
    // const symbol = process.env.BINANCE_SYMBOL!;
    // this.startTickerStream(symbol);
  }

  onModuleDestroy() {
    this.ws?.close();
  }

  startTickerStream(
    symbol: string,
    availableBalance?: number,
    leverage?: number,
    stepSize?: number,
  ) {
    const stream = `${symbol.toLowerCase()}@bookTicker`;
    const url = `wss://fstream.binance.com/ws/${stream}`;

    this.logger.log(`Starting bookTicker WS: ${url}`);

    this.ws = new WebSocket(url);

    this.ws.on('message', (data: Buffer) => {
      const payload = JSON.parse(data.toString());

      /*
        bookTicker payload:
        {
          u: 400900217,
          s: "BTCUSDT",
          b: "43110.1", // best bid
          a: "43110.2", // best ask
          E: 1700000000000
        }
      */

      const bid = parseFloat(payload.b);
      const ask = parseFloat(payload.a);
      const eventTime = payload.E;
      const quantity = this.calculateMaxQuantity(
        availableBalance || 0,
        leverage || 1,
        ask, // using ask price for sizing
        stepSize || 0.001,
      );

      this.tickerCache.set(symbol, { bid, ask, eventTime, quantity });

      // 🔕 Keep this DEBUG level to avoid log flooding
      // this.logger.log(
      //   `bookTicker ${symbol} | bid=${bid} ask=${ask} age=${Date.now() - eventTime}ms`,
      // );
    });

    this.ws.on('close', () => {
      this.logger.warn('bookTicker WS closed. Reconnecting...');
      // setTimeout(() => this.startTickerStream(symbol), 1000);
    });

    this.ws.on('error', (err) => {
      this.logger.error('bookTicker WS error', err);
      this.ws?.close();
    });
  }

  terminateTickerStream() {
    this.logger.log('Terminating bookTicker WS');
    this.ws?.terminate();
    this.ws = null;
    this.tickerCache.clear();
  }

  calculateMaxQuantity(
    availableBalance: number, // in USDT
    leverage: number,
    markPrice: number, // current symbol price
    stepSize: number, // from exchangeInfo filters
  ) {
    const effectiveBalance = availableBalance * 0.95;
    const rawQty = (effectiveBalance * leverage) / markPrice;
    return parseFloat((Math.floor(rawQty / stepSize) * stepSize).toFixed(1));
  }

  /**
   * Get price for market order sizing
   * BUY  → ask
   * SELL → bid
   */
  getMaxQuantity(symbol: string, maxAgeMs = 200): number {
    const cache = this.tickerCache.get(symbol);

    if (!cache) {
      throw new Error('bookTicker not available yet');
    }

    // const age = Date.now() - cache.eventTime;
    // this.logger.log('Ticker Age:', age);
    // if (age > maxAgeMs) {
    //   throw new Error(`bookTicker stale (${age} ms old)`);
    // }
    return cache.quantity;
  }

  /**
   * Optional: wait until first bookTicker arrives
   */
  async waitForReady(symbol: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();

    while (!this.tickerCache.has(symbol)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('bookTicker did not initialize in time');
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    this.logger.log(`bookTicker ready for ${symbol}`);
  }
}
