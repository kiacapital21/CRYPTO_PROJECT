import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';

@Injectable()
export class OrderService {
  private api = axios.create({
    baseURL: process.env.DELTA_BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.DELTA_API_KEY}`,
    },
  });

  constructor(
    private deltaExchangeService: DeltaExchangeService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async buy(symbol: string) {
    return this.placeOrder(symbol, 'buy');
  }

  async sell(symbol: string) {
    return this.placeOrder(symbol, 'sell');
  }

  async checkAndUpdateLeverage(symbol: string) {
    const product = await this.deltaExchangeService.getProductBySymbol(symbol);
    const leverageResponse = await this.deltaExchangeService.getOrderLeverage(
      product.id,
    );
    console.log('Current leverage:', leverageResponse);
    if (leverageResponse.leverage != 10) {
      console.log('Updating leverage to 10');
      const updateLeverageResponse =
        await this.deltaExchangeService.changeOrderLeverage(product.id, 10);
      return updateLeverageResponse.leverage;
    }
    return leverageResponse.leverage;
  }

  private async placeOrder(symbol: string, side: string) {
    const leverage = await this.checkAndUpdateLeverage(symbol);

    console.log(`Placing ${side} order for ${symbol}`);
    // return true;

    const walletBalance = await this.deltaExchangeService.getWalletBalance();
    console.log('Wallet balance:', walletBalance);
    const usdtBalance = walletBalance.result.find(
      (asset) => asset.asset_symbol === 'USD',
    );
    const availableBalance = parseFloat(usdtBalance.available_balance);
    const productData =
      await this.deltaExchangeService.getProductBySymbol(symbol);
    console.log('Product data:', productData);
    const product = productData;

    const contractValue = parseFloat(product.contract_value);

    const tickerData =
      await this.deltaExchangeService.getTickerBySymbol(symbol);
    const ticker = tickerData.result;
    // Get current mark price (use this as entry price estimate)
    const entryPrice = parseFloat(ticker.mark_price);
    console.log('Current entry price (mark price):', entryPrice);
    const maxSize = this.calculateMaxSize(
      availableBalance,
      leverage, // leverage
      contractValue,
      entryPrice,
    );

    // const marginedPositions =
    //   await this.deltaExchangeService.getPositionsMargined();
    // console.log('Margined positions:', marginedPositions);

    // const stop_loss_price =
    //   side === 'sell'
    //     ? (entryPrice + entryPrice * 0.003).toString()
    //     : (entryPrice - entryPrice * 0.003).toString();
    // console.log('Calculated stop loss price:', stop_loss_price);
    console.log(new Date().toISOString(), 'Placing main order...');
    const orderResponse = await this.deltaExchangeService.placeOrder({
      product_symbol: symbol,
      size: maxSize,
      side: side,
      order_type: 'market_order',
      // bracket_stop_loss_limit_price: stop_loss_price,
      // bracket_stop_loss_price: stop_loss_price,
      // bracket_stop_trigger_method: 'mark_price',
    });
    console.log('Order response:', orderResponse);
    console.log(new Date().toISOString(), 'Main order placed.');
    const averageFillPrice = orderResponse?.result?.average_fill_price;
    console.log(`Average fill price for the ${side} order:`, averageFillPrice);
    const stop_loss_price =
      side === 'sell'
        ? (averageFillPrice + averageFillPrice * 0.003).toString()
        : (averageFillPrice - averageFillPrice * 0.003).toString();
    console.log('Calculated stop loss price:', stop_loss_price);
    console.log(new Date().toISOString(), 'Placing stop loss order...');
    await this.cache.set('stopLossRequest', {
      product_id: orderResponse.result.product_id,
      side: side === 'buy' ? 'sell' : 'buy',
      size: maxSize,
      stop_price: stop_loss_price,
      order_type: 'market_order',
      time_in_force: 'gtc',
      reduce_only: true,
    });
    console.log(
      new Date().toISOString(),
      'Stop loss order request saved in cache:',
    );
    // await this.runStopLoss();
    return orderResponse;
  }

  async runStopLoss() {
    const stop_loss_req = await this.cache.get('stopLossRequest');
    if (!stop_loss_req) {
      console.log('No stop loss request found in cache.');
      return;
    }
    console.log('Placing stop loss order with request:', stop_loss_req);
    console.log(new Date().toISOString(), 'Placing stop loss order...');
    const stopLossOrderResponse =
      await this.deltaExchangeService.placeOrder(stop_loss_req);
    console.log(new Date().toISOString(), 'Stop loss order placed.');
    console.log('Stop loss order response:', stopLossOrderResponse);
    await this.cache.del('stopLossRequest');
    return stopLossOrderResponse;
  }

  // Calculate maximum order size
  calculateMaxSize(
    availableBalance: number,
    leverage: number,
    contractValue: number,
    entryPrice: number,
    feeRate: number = 0.0005, // 0.05% taker fee
  ): number {
    // Account for fees
    const effectiveBalance = availableBalance * 0.98; // Keep 2% buffer

    // Calculate max size
    const maxSize =
      (effectiveBalance * leverage) / (contractValue * entryPrice);

    // Round down to whole number (Delta doesn't support fractional sizes)
    return Math.floor(maxSize);
  }
}
