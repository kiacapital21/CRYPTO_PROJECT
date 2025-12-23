import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
@Injectable()
export class FundingService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async getLatestFundingRates() {
    const rates = await this.cache.get(`funding_rates`);
    console.log('Cached funding rates:', rates);
    if (!rates) return [];

    const fundingKeys = Object.keys(rates);

    const result: Array<{ symbol: string; fundingRate: number }> = [];
    for (const key of fundingKeys) {
      const symbol = key;
      const rate: number = rates[key] ?? 0;
      result.push({ symbol, fundingRate: rate });
    }
    return result;
  }
}
