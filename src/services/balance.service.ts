import { Injectable, Logger } from '@nestjs/common';
import { DeltaExchangeService } from 'src/deltaExchange/delta-exchange.service';
@Injectable()
export class BalanceService {
  private logger = new Logger(BalanceService.name);
  constructor(private deltaExchangeService: DeltaExchangeService) {}
  public async getAvailableBalance() {
    this.logger.log(`Getting available balance for trading...`);
    const walletBalance = await this.deltaExchangeService.getWalletBalance();
    const usdtBalance = walletBalance.result.find(
      (asset) => asset.asset_symbol === 'USD',
    );
    const availableBalance = parseFloat(usdtBalance.available_balance);
    this.logger.log('Available USD balance for trading:', availableBalance);
    return availableBalance;
  }
}
