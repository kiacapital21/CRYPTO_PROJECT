// delta-exchange.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AxiosRequestConfig } from 'axios';

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class DeltaExchangeService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private logger = new Logger(DeltaExchangeService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.baseUrl =
      this.configService.get<string>('DELTA_BASE_URL') ||
      'https://api.india.delta.exchange';
    this.apiKey = this.configService.get<string>('DELTA_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('DELTA_API_SECRET') || '';
  }

  /**
   * Generate HMAC-SHA256 signature for Delta Exchange API
   */
  private generateSignature(secret: string, message: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(message, 'utf8')
      .digest('hex');
  }

  /**
   * Create authenticated headers for Delta Exchange API requests
   * Generate signature immediately before use to minimize timing issues
   */
  private createAuthHeaders(
    method: string,
    path: string,
    queryString: string = '',
    body: string = '',
  ): Record<string, string> {
    // Generate timestamp immediately before creating signature
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureData = method + timestamp + path + queryString + body;
    const signature = this.generateSignature(this.apiSecret, signatureData);

    return {
      'api-key': this.apiKey,
      timestamp: timestamp,
      signature: signature,
      'User-Agent': 'nestjs-client',
      'Content-Type': 'application/json',
    };
  }

  /**
   * Make authenticated GET request with retry logic for signature expiration
   */
  async authenticatedGet(
    path: string,
    params?: Record<string, any>,
    retryCount: number = 0,
  ) {
    try {
      const queryString = params
        ? '?' + new URLSearchParams(params).toString()
        : '';

      this.logger.log(
        'Timestamp for GET request before creating auth headers:',
        Math.floor(Date.now() / 1000).toString(),
      );
      // Generate headers immediately before making the request
      const headers = this.createAuthHeaders('GET', path, queryString);
      this.logger.log(
        'Timestamp for GET request after creating auth headers:',
        Math.floor(Date.now() / 1000).toString(),
      );
      const config: AxiosRequestConfig = {
        headers,
        params,
        timeout: 5000, // Reduced timeout to 5 seconds
      };

      this.logger.log(
        'Timestamp for GET request before calling API:',
        Math.floor(Date.now() / 1000).toString(),
      );

      const response = await this.httpService.axiosRef.get(
        `${this.baseUrl}${path}`,
        config,
      );
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
      throw new Error(`Delta Exchange API Error: ${errorMessage}`);
    }
  }

  /**
   * Make authenticated POST request with retry logic for signature expiration
   */
  async authenticatedPost(path: string, data: any, retryCount: number = 0) {
    try {
      const body = JSON.stringify(data);

      // Generate headers immediately before making the request
      const headers = this.createAuthHeaders('POST', path, '', body);

      const config: AxiosRequestConfig = {
        headers,
        timeout: 5000, // Reduced timeout to 5 seconds
      };

      const response = await this.httpService.axiosRef.post(
        `${this.baseUrl}${path}`,
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
      throw new Error(`Delta Exchange API Error: ${errorMessage}`);
    }
  }

  /**
   * Make authenticated DELETE request
   */
  async authenticatedDelete(path: string, params?: Record<string, any>) {
    try {
      const queryString = params
        ? '?' + new URLSearchParams(params).toString()
        : '';

      // Generate headers immediately before making the request
      const headers = this.createAuthHeaders('DELETE', path, queryString);

      const config: AxiosRequestConfig = {
        headers,
        params,
        timeout: 5000,
      };

      const response = await this.httpService.axiosRef.delete(
        `${this.baseUrl}${path}`,
        config,
      );

      return response.data;
    } catch (error) {
      const errorMessage = error.response?.data?.error?.code || error.message;
      throw new Error(`Delta Exchange API Error: ${errorMessage}`);
    }
  }

  // API Methods
  async getOpenOrders(productId?: number) {
    const params = productId
      ? { product_id: productId, state: 'open' }
      : { state: 'open' };
    return this.authenticatedGet('/v2/orders', params);
  }

  async placeOrder(orderData) {
    try {
      return await this.authenticatedPost('/v2/orders', orderData);
    } catch (error) {
      this.logger.log(error.response?.data?.error?.code || error.message);
      return null;
    }
  }

  async cancelOrder(orderId: string) {
    return this.authenticatedDelete(`/v2/orders/${orderId}`);
  }

  async getWalletBalance() {
    return this.authenticatedGet('/v2/wallet/balances');
  }

  async getPositionsMargined() {
    return this.authenticatedGet('/v2/positions/margined');
  }

  async getPositions() {
    return this.authenticatedGet('/v2/positions');
  }

  async getOrderHistory(productId?: number, pageSize: number = 100) {
    const params = productId
      ? { product_id: productId, page_size: pageSize }
      : { page_size: pageSize };
    return this.authenticatedGet('/v2/orders/history', params);
  }

  async getFills(productId?: number, pageSize: number = 100) {
    const params = productId
      ? { product_ids: productId.toString(), page_size: pageSize }
      : { page_size: pageSize };
    return this.authenticatedGet('/v2/fills', params);
  }

  // Get product details by symbol (e.g., BTCUSD, ETHUSD)
  async getProductBySymbol(symbol: string): Promise<any> {
    try {
      this.logger.log(`Getting product data for ${symbol}...`);
      const response = await this.authenticatedGet(`/v2/products/${symbol}`);
      this.logger.log(`Product data for ${symbol} is fetched`);
      return response.result;
    } catch (error) {
      throw new Error(
        `Failed to get product details for ${symbol}: ${error.message}`,
      );
    }
  }

  // Get ticker data for current prices (mark_price, spot_price, etc.)
  async getTickerById(productId: string): Promise<any> {
    try {
      const response = await this.authenticatedGet(`/v2/tickers/${productId}`);
      return response;
    } catch (error) {
      throw new Error(
        `Failed to get ticker for ${productId}: ${error.message}`,
      );
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
  async changeOrderLeverage(productId: number, leverage: number): Promise<any> {
    const path = `/v2/products/${productId}/orders/leverage`;

    const leveragePayload = {
      leverage: leverage,
    };

    try {
      const response = await this.authenticatedPost(`${path}`, leveragePayload);
      return response.result;
    } catch (error) {
      throw new Error(
        `Failed to change order leverage: ${error.response?.data?.error || error.message}`,
      );
    }
  }

  async setCrypto(symbol: string) {
    this.logger.log(`Setting trading crypto to ${symbol}`);
    await this.cache.set('tradingCrypto', symbol);
    this.logger.log(`Trading crypto set to ${symbol}`);
    return { success: true, symbol: await this.cache.get('tradingCrypto') };
  }

  async getCrypto() {
    const symbol = await this.cache.get<string>('tradingCrypto');
    this.logger.log(`Retrieved trading crypto: ${symbol}`);
    return { symbol: symbol || process.env.SYMBOL || '' };
  }

  async clearCrypto() {
    await this.cache.del('tradingCrypto');
    this.logger.log(`Cleared trading crypto from cache`);
    return { success: true };
  }
}
