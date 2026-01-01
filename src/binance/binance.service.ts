// delta-exchange.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios, { AxiosRequestConfig } from 'axios';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { DelayService } from 'src/services/delay.service';
import EventEmitter2 from 'eventemitter2';
import { BinanceWsService } from 'src/websocket/binance-ws.service';

@Injectable()
export class BinanceService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly BALANCE_BUFFER = 0.95; // Extract constant
  private readonly STOP_LOSS_PERCENTAGE = 0.003; // 0.3% stop loss
  private logger = new Logger(BinanceService.name);
  private readonly STOP_LOSS_CACHE_KEY = 'binanceStopLossRequest';
  private readonly STOP_LOSS_EVENT = 'binanceStopLossRequestCached';
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private readonly delayService: DelayService,
    private eventEmitter: EventEmitter2,
    private readonly binanceWsService: BinanceWsService,
  ) {
    this.baseUrl =
      this.configService.get<string>('BINANCE_BASE_URL') ||
      'https://testnet.binancefuture.com';
    this.apiKey = this.configService.get<string>('BINANCE_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('BINANCE_API_SECRET') || '';
  }

  /**
   * Generate HMAC-SHA256 signature for Binance API
   */
  private generateSignature(secret: string, message: string): string {
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  /**
   * Create authenticated headers for Binance API requests
   * Generate signature immediately before use to minimize timing issues
   */
  private createAuthHeaders(): Record<string, string | number> {
    // Generate timestamp immediately before creating signature
    const timestamp = Date.now();
    const recvWindow = 5000; // 5 seconds
    const query = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
    const signature = this.generateSignature(this.apiSecret, query);

    return {
      'X-MBX-APIKEY': this.apiKey,
      timestamp: timestamp,
      signature: signature,
      recvWindow: recvWindow,
    };
  }

  /**
   * Make authenticated GET request with retry logic for signature expiration
   */
  async authenticatedGet(
    path: string,
    params?: Record<string, any>,
    retryCount: number = 0,
    isAuthenticated: boolean = true,
  ) {
    try {
      // const queryString = params
      //   ? '?' + new URLSearchParams(params).toString()
      //   : '';

      this.logger.log('GET request before creating auth headers:');
      // Generate headers immediately before making the request
      const headers = isAuthenticated ? this.createAuthHeaders() : undefined;
      this.logger.log('GET request after creating auth headers:');
      const config: AxiosRequestConfig = {
        headers,
        params,
        timeout: 5000, // Reduced timeout to 5 seconds
      };

      this.logger.log(
        'Timestamp for GET request before calling API:',
        Math.floor(Date.now() / 1000).toString(),
      );

      const response = isAuthenticated
        ? await this.httpService.axiosRef.get(
            `${this.baseUrl}${path}?timestamp=${headers?.timestamp}&recvWindow=${headers?.recvWindow}&signature=${headers?.signature}`,
            config,
          )
        : await this.httpService.axiosRef.get(`${this.baseUrl}${path}`, config);
      this.logger.log(
        'Timestamp for GET request after calling API:',
        Math.floor(Date.now() / 1000).toString(),
      );
      return response.data;
    } catch (error) {
      // Retry once if signature expired
      if (
        error.response?.data?.error?.code === 'expired_signature' &&
        retryCount === 0
      ) {
        this.logger.log('Signature expired, retrying with new signature...');
        // Wait a brief moment before retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.authenticatedGet(path, params, retryCount + 1);
      }
      this.logger.log(JSON.stringify(error.response?.data));
      const errorMessage = error.response?.data?.error?.code || error.message;
      throw new Error(`Binance API Error: ${errorMessage}`);
    }
  }

  /**
   * Make authenticated POST request with retry logic for signature expiration
   */
  async authenticatedPost(path: string, data: any, retryCount: number = 0) {
    try {
      // Generate headers immediately before making the request
      const headers = this.createAuthHeaders();

      const config: AxiosRequestConfig = {
        headers,
        timeout: 5000, // Reduced timeout to 5 seconds
      };

      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}${path}?timestamp=${headers.timestamp}&recvWindow=${headers.recvWindow}&signature=${headers.signature}`,
        data,
        config,
      );

      return response.data;
    } catch (error) {
      // Retry once if signature expired
      if (
        error.response?.data?.error?.code === 'expired_signature' &&
        retryCount === 0
      ) {
        this.logger.log('Signature expired, retrying with new signature...');
        // Wait a brief moment before retry
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.authenticatedPost(path, data, retryCount + 1);
      }

      this.logger.log(JSON.stringify(error.response?.data));
      const errorMessage = error.response?.data?.error?.code || error.message;
      throw new Error(`Binance API Error: ${errorMessage}`);
    }
  }

  /**
   * Make authenticated DELETE request
   */
  // async authenticatedDelete(path: string, params?: Record<string, any>) {
  //   try {
  //     const queryString = params
  //       ? '?' + new URLSearchParams(params).toString()
  //       : '';

  //     // Generate headers immediately before making the request
  //     const headers = this.createAuthHeaders('DELETE', path, queryString);

  //     const config: AxiosRequestConfig = {
  //       headers,
  //       params,
  //       timeout: 5000,
  //     };

  //     const response = await this.httpService.axiosRef.delete(
  //       `${this.baseUrl}${path}`,
  //       config,
  //     );

  //     return response.data;
  //   } catch (error) {
  //     const errorMessage = error.response?.data?.error?.code || error.message;
  //     throw new Error(`Binance API Error: ${errorMessage}`);
  //   }
  // }

  // API Methods
  async getOpenOrders(productId?: number) {
    const params = productId
      ? { product_id: productId, state: 'open' }
      : { state: 'open' };
    return this.authenticatedGet('/v2/orders', params);
  }

  async getMarkPrice(symbol: string = 'LIGHTUSDT') {
    const response = await this.authenticatedGet(
      '/fapi/v2/ticker/price' + '?symbol=' + symbol,
      { symbol: symbol },
      2,
      false,
    );
    // const walletBalance = await this.getWalletBalance();
    // const availableBalance = walletBalance.find(
    //   (item) => item.asset === 'USDT',
    // );
    // console.log('Available Balance:', availableBalance);
    // const exchangeInfo = await this.getExchangeInfo(); // Example step size, replace with actual from exchangeInfo if needed
    // const stepSize = exchangeInfo.symbols
    //   .find((s) => s.symbol === symbol)
    //   .filters.find((f) => f.filterType === 'LOT_SIZE').stepSize;
    // const leverageInfo = await this.changeLeverage(symbol, 10); // Example leverage change
    // console.log('Leverage Set:', leverageInfo);
    // const quantity = this.calculateMaxQuantity(
    //   parseFloat(availableBalance.balance),
    //   leverageInfo.leverage,
    //   parseFloat(response.price),
    //   stepSize,
    // );
    // console.log('Max Quantity:', quantity);
    // const orderResponse = await this.placeMarketOrder(symbol, 'BUY', quantity); // Example market order
    // console.log('Order Response:', orderResponse);
    // const stopLossRequest = await this.cacheStopLossRequest(
    //   'buy',
    //   orderResponse.avgPrice,
    //   quantity,
    //   symbol,
    // );

    // const stopLossOrderResponse = await this.placeStopLoss(
    //   orderResponse.orderId,
    //   symbol,
    //   'SELL',
    //   quantity,
    //   // stopLossRequest.stop_price as unknown as number,
    // );

    // console.log('Stop Loss Order Response:', stopLossOrderResponse);
    return {
      response,
      // availableBalance,
      // stepSize,
      // leverageInfo,
      // orderResponse,
      // stopLossOrderResponse,
    };
  }

  async getTickerPrice(symbol: string) {
    this.logger.log('Fetching ticker data for entry price...');
    return this.authenticatedGet(
      '/fapi/v2/ticker/price' + '?symbol=' + symbol,
      { symbol: symbol },
      2,
      false,
    );
  }

  calculateMaxQuantity(
    availableBalance: number, // in USDT
    leverage: number,
    markPrice: number, // current symbol price
    stepSize: number, // from exchangeInfo filters
  ) {
    const effectiveBalance = availableBalance * this.BALANCE_BUFFER;
    const rawQty = (effectiveBalance * leverage) / markPrice;
    return parseFloat((Math.floor(rawQty / stepSize) * stepSize).toFixed(1)); // Math.floor(rawQty / stepSize) * stepSize; // rawQty;
  }

  async getExchangeInfo() {
    return this.authenticatedGet('/fapi/v1/exchangeInfo', {}, 2, false);
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
    )
      .toFixed(2)
      .toString();
  }

  async cacheStopLossRequest(
    side: string,
    averageFillPrice: number,
    maxSize: number,
    symbol: string,
  ) {
    const stopLossPrice = this.calculateStopLossPrice(averageFillPrice, side);
    this.logger.log('Calculated stop loss price:', stopLossPrice);

    const stopLossRequest = {
      symbol: symbol,
      side: side === 'buy' ? 'sell' : 'buy',
      size: maxSize,
      stop_price: stopLossPrice,
      type: 'market_order',
      reduceOnly: true,
    };

    await this.cache.set(this.STOP_LOSS_CACHE_KEY, stopLossRequest);
    this.logger.log('Stop loss order request cached');

    // // Emit event
    this.eventEmitter.emit(this.STOP_LOSS_EVENT, {
      symbol: symbol,
    });
    return stopLossRequest;
  }

  async getWalletBalance() {
    return this.authenticatedGet('/fapi/v3/balance');
  }

  async changeLeverage(symbol: string, leverage: number) {
    const timestamp = Date.now();
    const query = `symbol=${symbol}&leverage=${leverage}&timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(query)
      .digest('hex');

    const url = `${this.baseUrl}/fapi/v1/leverage?${query}&signature=${signature}`;

    const res = await axios.post(url, null, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
    });

    return res.data;
  }

  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
  ) {
    try {
      this.logger.log('Placing main order...');
      const timestamp = Date.now();
      const query = `newOrderRespType=RESULT&symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;

      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(query)
        .digest('hex');

      const url = `${this.baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
      const response = await axios.post(url, null, {
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });
      this.logger.log('Main order placed.');
      return response.data;
    } catch (error) {
      this.logger.error('Error placing market order:', error.response.data);
    }
  }

  async placeStopLoss(
    orderId: number,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    // stopPrice: number,
  ) {
    try {
      const timestamp = Date.now();
      const query = `orderId=${orderId}&reduceOnly=true&newOrderRespType=RESULT&type=MARKET&symbol=${symbol}&side=${side}&quantity=${quantity}&timestamp=${timestamp}`;
      console.log('Placing stop loss with query:');
      console.log(query);
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(query)
        .digest('hex');
      const url = `${this.baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
      const res = await axios.post(url, null, {
        headers: { 'X-MBX-APIKEY': this.apiKey },
      });
      return res.data;
    } catch (error) {
      this.logger.error('Error placing stop loss order:', error.response.data);
    }
  }

  // Get current order leverage for a product
  async getOrderLeverage(productId: number): Promise<any> {
    const path = `/v2/products/${productId}/orders/leverage`;

    try {
      const response = await this.authenticatedGet(`${path}`);
      return response.result;
    } catch (error) {
      throw new Error(`Failed to get order leverage: ${error.message}`);
    }
  }

  // Change order leverage for a product
  // async changeOrderLeverage(productId: number, leverage: number): Promise<any> {
  //   const path = `/v2/products/${productId}/orders/leverage`;

  //   const leveragePayload = {
  //     leverage: leverage,
  //   };

  //   try {
  //     const response = await this.authenticatedPost(`${path}`, leveragePayload);
  //     return response.result;
  //   } catch (error) {
  //     throw new Error(
  //       `Failed to change order leverage: ${error.response?.data?.error || error.message}`,
  //     );
  //   }
  // }

  async setCrypto(symbol: string) {
    this.logger.log(`Setting binance trading crypto to ${symbol}`);
    await this.cache.set('binanceTradingCrypto', symbol);
    this.logger.log(`Binance trading crypto set to ${symbol}`);
    return {
      success: true,
      symbol: await this.cache.get('binanceTradingCrypto'),
    };
  }

  async getCrypto() {
    const symbol = await this.cache.get<string>('binanceTradingCrypto');
    this.logger.log(`Retrieved binance trading crypto: ${symbol}`);
    return { symbol: symbol || null };
  }

  async clearCrypto() {
    await this.cache.del('binanceTradingCrypto');
    this.logger.log(`Cleared binance trading crypto from cache`);
    return { success: true };
  }

  async runLocalStrategy() {
    let symbol = process.env.BINANCE_SYMBOL || '';
    this.logger.log(
      'Running Binance local trading strategy... symbol:',
      symbol,
    );

    const [walletBalance, exchangeInfo, leverageInfo] = await Promise.all([
      this.getWalletBalance(),
      this.getExchangeInfo(),
      this.changeLeverage(symbol, 10),
    ]);

    const availableBalance = walletBalance.find(
      (item) => item.asset === 'USDT',
    );
    console.log('Available Balance:', availableBalance);

    const stepSize = exchangeInfo.symbols
      .find((s) => s.symbol === symbol)
      .filters.find((f) => f.filterType === 'LOT_SIZE').stepSize;

    console.log('Step Size:', stepSize);
    console.log('Leverage Set:', leverageInfo);

    this.binanceWsService.startTickerStream(
      symbol,
      parseFloat(availableBalance.balance),
      leverageInfo.leverage,
      stepSize,
    );

    this.logger.log('Waiting for place order time...');
    await this.delayService.delay();

    // const tickerPrice = await this.getTickerPrice(symbol);
    const quantity = this.binanceWsService.getMaxQuantity(symbol, 200);
    this.binanceWsService.terminateTickerStream();
    // this.logger.log('Ticker Price:', tickerPrice);
    // const quantity = this.calculateMaxQuantity(
    //   parseFloat(availableBalance.balance),
    //   leverageInfo.leverage,
    //   parseFloat(tickerPrice.price),
    //   stepSize,
    // );
    console.log('Max Quantity:', quantity);
    const orderResponse = await this.placeMarketOrder(symbol, 'BUY', quantity); // Example market order
    console.log('Order Response:', orderResponse);
    this.cacheStopLossRequest('buy', orderResponse.avgPrice, quantity, symbol);
    await this.delayService.delayForStopLoss();
    this.logger.log('Placing closing loss order now...');
    const stopLossOrderResponse = await this.placeStopLoss(
      orderResponse.orderId,
      symbol,
      'SELL',
      quantity,
      // stopLossRequest.stop_price as unknown as number,
    );

    console.log('Stop Loss Order Response:', stopLossOrderResponse);
  }
}
