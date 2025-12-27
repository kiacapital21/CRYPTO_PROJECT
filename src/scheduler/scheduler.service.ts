import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TradingEngineService } from '../services/trading-engine.service';

@Injectable()
export class SchedulerService {
  private logger = new Logger(SchedulerService.name);
  constructor(private readonly tradingEngine: TradingEngineService) {}

  // @Cron('50 29 09 * * *', { timeZone: 'Asia/Kolkata' })
  // async runDailyStrategyAt9() {
  //   this.logger.log(
  //     'Running daily trading strategy...Starting trading engine...',
  //   );
  //   await this.tradingEngine.runMorningStrategy();
  //   this.logger.log('Daily trading strategy completed.');
  // }

  // @Cron('50 29 13 * * *', { timeZone: 'Asia/Kolkata' })
  // async runDailyStrategyAt13() {
  //   this.logger.log(
  //     'Running daily trading strategy...Starting trading engine...',
  //   );
  //   await this.tradingEngine.runMorningStrategy();
  //   this.logger.log('Daily trading strategy completed.');
  // }

  // @Cron('50 29 17 * * *', { timeZone: 'Asia/Kolkata' })
  // async runDailyStrategyAt17() {
  //   this.logger.log(
  //     'Running daily trading strategy...Starting trading engine...',
  //   );
  //   await this.tradingEngine.runMorningStrategy();
  //   this.logger.log('Daily trading strategy completed.');
  // }

  // @Cron('50 29 21 * * *', { timeZone: 'Asia/Kolkata' })
  // async runDailyStrategyAt21() {
  //   this.logger.log(
  //     'Running daily trading strategy...Starting trading engine...',
  //   );
  //   await this.tradingEngine.runMorningStrategy();
  //   this.logger.log('Daily trading strategy completed.');
  // }

  @Cron('50 25 10 * * *', { timeZone: 'Asia/Kolkata' })
  async runDailyStrategy() {
    this.logger.log(
      'Running daily trading strategy...Starting trading engine...',
    );
    await this.tradingEngine.runLocalStrategy();
    this.logger.log('Daily trading strategy completed.');
  }

  // @Cron('00 22 18 * * *', { timeZone: 'Asia/Kolkata' })
  // async runStopLossAt21() {
  //   this.logger.log(
  //     'Running daily stop loss placement...Starting stop loss placement in trading engine...',
  //   );
  //   await this.tradingEngine.placeStopLoss();
  //   this.logger.log('Daily stop loss placement completed.');
  //   this.logger.log('Stopping the scheduler service...');
  //   process.exit(0);
  // }
}
