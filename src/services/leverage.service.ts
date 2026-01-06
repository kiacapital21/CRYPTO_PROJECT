import { Injectable, Logger } from '@nestjs/common';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';

@Injectable()
export class LeverageService {
  private readonly LEVERAGE = 10;
  private logger = new Logger(LeverageService.name);
  constructor(private deltaExchangeService: DeltaExchangeService) {}
  async checkAndUpdateLeverage(symbol: string) {
    this.logger.log(`Checking and updating leverage for ${symbol}...`);
    const product = await this.deltaExchangeService.getProductBySymbol(symbol);
    const leverageResponse = await this.deltaExchangeService.getOrderLeverage(
      product.id,
    );
    this.logger.log('Current leverage:', leverageResponse);
    if (leverageResponse.leverage != this.LEVERAGE) {
      this.logger.log('Updating leverage to :', this.LEVERAGE);
      const updateLeverageResponse =
        await this.deltaExchangeService.changeOrderLeverage(
          product.id,
          this.LEVERAGE,
        );
      return updateLeverageResponse.leverage;
    }
    this.logger.log('Leverage:', leverageResponse.leverage);
    return leverageResponse.leverage;
  }
}
