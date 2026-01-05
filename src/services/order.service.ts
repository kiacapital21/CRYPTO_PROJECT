import { Injectable, Logger } from '@nestjs/common';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';
import { DelayService } from './delay.service';
import { LeverageService } from './leverage.service';
import { TickerService } from './ticker.service';
import { BalanceService } from './balance.service';
import { StopLossService } from './stop-loss.service';

@Injectable()
export class OrderService {
  private logger = new Logger(OrderService.name);
  t;
  private readonly BALANCE_BUFFER = 0.95; // Extract constant

  constructor(
    private deltaExchangeService: DeltaExchangeService,
    private delayService: DelayService,
    private leverageService: LeverageService,
    private tickerService: TickerService,
    private balanceService: BalanceService,
    private stopLossService: StopLossService,
  ) {}

  async buy(symbol: string) {
    return this.placeOrder(symbol, 'buy');
  }

  async sell(symbol: string) {
    return this.placeOrder(symbol, 'sell');
  }

  private async placeOrder(symbol: string, side: string) {
    try {
      // Parallel requests for leverage and balance
      const [leverage, availableBalance, productData] = await Promise.all([
        this.leverageService.checkAndUpdateLeverage(symbol),
        this.balanceService.getAvailableBalance(),
        this.deltaExchangeService.getProductBySymbol(symbol),
      ]);

      const contractValue = parseFloat(productData.contract_value);
      const productId = productData.id;

      this.logger.log('Waiting for place order time...');
      await this.delayService.delay();

      const entryPrice = await this.tickerService.getEntryPrice(productId);
      const maxSize = this.calculateMaxSize(
        availableBalance,
        leverage,
        contractValue,
        entryPrice,
      );

      const orderResponse = await this.placeMainOrder(productId, maxSize, side);

      const averageFillPrice = orderResponse?.result?.average_fill_price;
      this.logger.log(
        `Average fill price for the ${side} order: ${averageFillPrice}`,
      );

      // Cache stop loss and emit event together
      await this.stopLossService.cacheStopLossRequest(
        productId,
        side,
        averageFillPrice,
        maxSize,
        symbol,
      );

      // Wait for stop loss timing
      await this.delayService.delayForStopLoss();
      this.logger.log('Placing stop loss order now...');

      const stopLossResponse = await this.stopLossService.runStopLoss();
      this.logger.log('Stop loss order response:', stopLossResponse);

      return orderResponse;
    } catch (error) {
      this.logger.error(
        `Order placement failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  calculateMaxSize(
    availableBalance: number,
    leverage: number,
    contractValue: number,
    entryPrice: number,
  ): number {
    const effectiveBalance = availableBalance * this.BALANCE_BUFFER;
    const maxSize =
      (effectiveBalance * leverage) / (contractValue * entryPrice);
    return Math.floor(maxSize);
  }

  private async placeMainOrder(
    productId: number,
    maxSize: number,
    side: string,
  ) {
    this.logger.log('Placing main order...');
    const orderResponse = await this.deltaExchangeService.placeOrder({
      product_id: productId,
      size: maxSize,
      side: side,
      order_type: 'market_order',
    });
    this.logger.log('Main order placed.');
    return orderResponse;
  }
}
