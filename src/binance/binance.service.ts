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
import { FundingState } from 'src/websocket/funding-state';
import { BinanceUserWsService } from 'src/websocket/binance-user-ws.service';
import { parse } from 'path';

@Injectable()
export class BinanceService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly BALANCE_BUFFER = 0.9; // Extract constant
  private readonly LEVERAGE = 5;
  private readonly STOP_LOSS_PERCENTAGE = 0.002; // 0.3% stop loss
  private readonly LIMIT_LOSS_PERCENTAGE = 0.003; // 0.3% stop loss
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
    private readonly binanceUserWsService: BinanceUserWsService,
    private readonly state: FundingState,
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
    side: 'BUY' | 'SELL',
    tickSize: number,
  ): { stopPrice: number; limitPrice: number } {
    const stopPrice =
      side === 'SELL'
        ? averageFillPrice * (1 + this.STOP_LOSS_PERCENTAGE)
        : averageFillPrice * (1 - this.STOP_LOSS_PERCENTAGE);
    const limitPrice =
      side === 'SELL'
        ? averageFillPrice * (1 + this.LIMIT_LOSS_PERCENTAGE)
        : averageFillPrice * (1 - this.LIMIT_LOSS_PERCENTAGE);

    const stopTicks =
      side === 'SELL'
        ? Math.ceil(stopPrice / tickSize)
        : Math.floor(stopPrice / tickSize);

    const limitTicks =
      side === 'SELL'
        ? Math.ceil(limitPrice / tickSize)
        : Math.floor(limitPrice / tickSize);

    const formattedStopPrice = stopTicks * tickSize;
    const formattedLimitPrice = limitTicks * tickSize;
    const decimals = Math.round(Math.log10(1 / tickSize));

    return {
      stopPrice: parseFloat(formattedStopPrice.toFixed(decimals)),
      limitPrice: parseFloat(formattedLimitPrice.toFixed(decimals)),
    };
  }

  // async cacheStopLossRequest(
  //   side: string,
  //   averageFillPrice: number,
  //   maxSize: number,
  //   symbol: string,
  // ) {
  //   const stopLossPrice = this.calculateStopLossPrice(averageFillPrice, side);
  //   this.logger.log('Calculated stop loss price:', stopLossPrice);

  //   const stopLossRequest = {
  //     symbol: symbol,
  //     side: side === 'buy' ? 'sell' : 'buy',
  //     size: maxSize,
  //     stop_price: stopLossPrice,
  //     type: 'market_order',
  //     reduceOnly: true,
  //   };

  //   await this.cache.set(this.STOP_LOSS_CACHE_KEY, stopLossRequest);
  //   this.logger.log('Stop loss order request cached');

  //   // // Emit event
  //   this.eventEmitter.emit(this.STOP_LOSS_EVENT, {
  //     symbol: symbol,
  //   });
  //   return stopLossRequest;
  // }

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

  async getPremiumIndex(symbol: string) {
    return this.authenticatedGet(
      '/fapi/v1/premiumIndex?symbol=' + symbol,
      { symbol: symbol },
      2,
      false,
    );
  }

  async placeMarketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
  ) {
    try {
      const timestamp = Date.now();
      const query = `newOrderRespType=RESULT&symbol=${symbol}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;

      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(query)
        .digest('hex');
      console.log('Placing main order with query:');
      console.log(query);

      const url = `${this.baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
      const response = await axios.post(url, null, {
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });
      this.logger.log('Main order placed: ', response.data);
      this.eventEmitter.emit('placedOrder', response.data);
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

  // async putStopLoss(
  //   symbol: string,
  //   side: 'BUY' | 'SELL',
  //   stopPrice: number,
  //   quantity: number,
  // ) {
  //   try {
  //     const timestamp = Date.now();
  //     const query = `type=STOP_MARKET&stopPrice=${stopPrice}&workingType=MARK_PRICE&symbol=${symbol}&side=${side}&quantity=${quantity}&timestamp=${timestamp}`;
  //     console.log('Placing stop loss with query:');
  //     console.log(query);
  //     const signature = crypto
  //       .createHmac('sha256', this.apiSecret)
  //       .update(query)
  //       .digest('hex');
  //     const url = `${this.baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
  //     const res = await axios.post(url, null, {
  //       headers: { 'X-MBX-APIKEY': this.apiKey },
  //     });
  //     return res.data;
  //   } catch (error) {
  //     this.logger.error('Error placing stop loss order:', error.response.data);
  //   }
  // }

  async putStopLoss(
    symbol: string,
    side: 'BUY' | 'SELL',
    stopPrice: number,
    limitPrice: number,
    quantity: number,
  ) {
    try {
      const timestamp = Date.now();
      const query = `type=STOP&stopPrice=${stopPrice}&price=${limitPrice}&workingType=MARK_PRICE&symbol=${symbol}&side=${side}&quantity=${quantity}&reduceOnly=true&timeInForce=GTC&timestamp=${timestamp}`;
      console.log('Placing stop loss with query:');
      console.log(query);
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(query)
        .digest('hex');
      const url = `${this.baseUrl}/fapi/v1/order?${query}&signature=${signature}`;
      let res;
      let retryCount = 0;
      while (retryCount < 8) {
        try {
          res = await axios.post(url, null, {
            headers: { 'X-MBX-APIKEY': this.apiKey },
          });
          break;
        } catch (error) {
          this.logger.error(
            'Error placing stop loss order:',
            error.response.data,
          );
          retryCount++;
          if (retryCount === 8) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      return res.data;
    } catch (error) {
      this.logger.error('Error placing stop loss order:', error.response.data);
      throw error;
    }
  }

  async setCrypto(symbol: string) {
    this.logger.log(`Setting binance trading crypto to ${symbol}`);
    await this.cache.set('binanceTradingCrypto', symbol, 1 * 60 * 60 * 1000);
    this.logger.log(`Binance trading crypto set to ${symbol}`);
    return {
      success: true,
      symbol: await this.cache.get('binanceTradingCrypto'),
    };
  }

  async getCrypto() {
    const symbol = await this.cache.get<string>('binanceTradingCrypto');
    this.logger.log(`Retrieved binance trading crypto: ${symbol}`);
    return { symbol: symbol || process.env.BINANCE_SYMBOL || '' };
  }

  async clearCrypto() {
    await this.cache.del('binanceTradingCrypto');
    this.logger.log(`Cleared binance trading crypto from cache`);
    return { success: true };
  }

  getUSDTBalance(walletBalance) {
    const availableBalance = walletBalance.find(
      (item) => item.asset === 'USDT',
    );
    return availableBalance;
  }

  async runLocalStrategy() {
    let symbol = process.env.BINANCE_SYMBOL || '';
    const cacheCrypto = await this.cache.get<string>('binanceTradingCrypto');
    this.logger.log(`Cached trading crypto: ${cacheCrypto}`);
    if (cacheCrypto) {
      symbol = cacheCrypto;
    }
    this.logger.log(
      'Running Binance local trading strategy... symbol:',
      symbol,
    );

    const [walletBalance, exchangeInfo, leverageInfo, premiumIndex] =
      await Promise.all([
        this.getWalletBalance(),
        this.getExchangeInfo(),
        this.changeLeverage(symbol, this.LEVERAGE),
        this.getPremiumIndex(symbol),
      ]);

    const availableBalance = this.getUSDTBalance(walletBalance);
    console.log('Available Balance:', availableBalance);
    const exchangeSymbol = exchangeInfo.symbols.find(
      (s) => s.symbol === symbol,
    );
    const stepSize = exchangeSymbol.filters.find(
      (f) => f.filterType === 'LOT_SIZE',
    ).stepSize;

    const tickSize = exchangeSymbol.filters.find(
      (f) => f.filterType === 'PRICE_FILTER',
    ).tickSize;

    console.log('premiumIndex:', premiumIndex);
    let fundingTime = premiumIndex.nextFundingTime;
    fundingTime = new Date().getTime() + 10 * 1000;
    console.log('Step Size:', stepSize);
    console.log('Leverage Set:', leverageInfo);
    console.log('Next Funding Time:', fundingTime);

    this.binanceWsService.startTickerStream(
      symbol,
      parseFloat(availableBalance.balance),
      leverageInfo.leverage,
      stepSize,
    );
    // await this.binanceUserWsService.connect();
    await this.delayService.delayForTickerStream();
    const { markPrice, quantity } = this.binanceWsService.getMaxQuantity(
      symbol,
      200,
    );
    this.logger.log('Calculated order quantity:', quantity);
    await this.binanceWsService.terminateTickerStream();

    this.listenToIntervalAndForceClose(symbol, quantity);

    this.logger.log('Waiting for place order time...');

    await this.delayService.delay();

    const orderResponse = await this.placeMarketOrder(symbol, 'BUY', quantity);
    if (!orderResponse?.orderId) return;
    const { stopPrice, limitPrice } = this.calculateStopLossPrice(
      orderResponse.avgPrice,
      'BUY',
      tickSize,
    );
    //wait for 100 ms
    const stopLossOrderResponse = await this.putStopLoss(
      symbol,
      'SELL',
      stopPrice,
      limitPrice,
      quantity,
    );
    this.logger.log('Stop Loss Order Response:', stopLossOrderResponse);
    const stopOrderId = stopLossOrderResponse?.orderId;
    if (!stopOrderId) return;
    // Cancel after 30 seconds if not triggered
    // setTimeout(async () => {
    //   try {
    //     const cancelResp = await this.cancelStopOrder(symbol, stopOrderId);
    //     console.log('STOP_MARKET canceled:', cancelResp);
    //   } catch (err) {
    //     console.error(
    //       'Failed to cancel STOP_MARKET:',
    //       err.response?.data || err,
    //     );
    //   }
    // }, 3 * 1000);
  }

  private async performClose(
    symbol: string,
    quantity: number,
    orderResponse: any,
    isForceClose = false,
  ) {
    console.log('is force close:', isForceClose);
    await this.safeClose(symbol, quantity, orderResponse);
    this.binanceUserWsService.stop();
    this.state.clear();
  }

  private listenToFundFee(
    symbol: string,
    quantity: number,
    orderResponse: any,
  ) {
    this.eventEmitter.on('funding.fee', async () => {
      // if (data.asset === 'USDT') {
      this.logger.log('Funding fee received, safe to close position.');
      await this.performClose(symbol, quantity, orderResponse);
      // }
    });
  }

  private listenToIntervalAndForceClose(symbol: string, quantity: number) {
    console.log('listening to place order');
    this.eventEmitter.on('placedOrder', async (orderResponse) => {
      console.log('Placed Order Response inside listenToIntervalAndForceClose');
      if (!orderResponse?.orderId) return;
      // await this.delayService.delayForStopLoss();

      // await this.performClose(symbol, quantity, orderResponse, true);
    });
  }

  private closing = false;
  private async safeClose(
    symbol: string,
    quantity: number,
    orderResponse: any,
  ) {
    if (this.closing) return;
    this.closing = true;
    const stopLossOrderResponse = await this.placeStopLoss(
      orderResponse.orderId,
      symbol,
      'SELL',
      quantity,
    );
    this.logger.log('Stop Loss Order Response:', stopLossOrderResponse);
  }

  async cancelStopOrder(symbol: string, orderId: number) {
    const timestamp = Date.now();
    const query = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(query)
      .digest('hex');

    const resp = await axios.delete(
      `https://fapi.binance.com/fapi/v1/order?${query}&signature=${signature}`,
      { headers: { 'X-MBX-APIKEY': this.apiKey } },
    );

    return resp.data;
  }
}
