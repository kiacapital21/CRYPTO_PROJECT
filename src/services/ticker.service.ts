import { Injectable, Logger } from '@nestjs/common';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';

@Injectable()
export class TickerService {
  private logger = new Logger(TickerService.name);
  constructor(private deltaExchangeService: DeltaExchangeService) {}

  public async getEntryPrice(productId: string) {
    this.logger.log('Fetching ticker data for entry price...');
    const tickerData = await this.deltaExchangeService.getTickerById(productId);
    const ticker = tickerData.result;
    const entryPrice = parseFloat(ticker.mark_price);
    this.logger.log('Ticker data fetched. entryPrice: ', entryPrice);
    return entryPrice;
  }
}
