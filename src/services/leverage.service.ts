import { Injectable, Logger } from '@nestjs/common';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';

@Injectable()
export class LeverageService {
  private logger = new Logger(LeverageService.name);
  constructor(private deltaExchangeService: DeltaExchangeService) {}
  async checkAndUpdateLeverage(symbol: string) {
    this.logger.log(`Checking and updating leverage for ${symbol}...`);
    const product = await this.deltaExchangeService.getProductBySymbol(symbol);
    const leverageResponse = await this.deltaExchangeService.getOrderLeverage(
      product.id,
    );
    this.logger.log('Current leverage:', leverageResponse);
    if (leverageResponse.leverage != 10) {
      this.logger.log('Updating leverage to 10');
      const updateLeverageResponse =
        await this.deltaExchangeService.changeOrderLeverage(product.id, 10);
      return updateLeverageResponse.leverage;
    }
    this.logger.log('Leverage:', leverageResponse.leverage);
    return leverageResponse.leverage;
  }
}
