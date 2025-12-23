import { Injectable } from '@nestjs/common';
import { Cron, Timeout } from '@nestjs/schedule';
import { TradingEngineService } from '../services/trading-engine.service';

@Injectable()
export class SchedulerService {
  constructor(private readonly tradingEngine: TradingEngineService) {}

  @Cron('57 29 17 * * *', { timeZone: 'Asia/Kolkata' })
  // @Timeout(15000)
  async runDailyStrategy() {
    console.log('Running daily trading strategy...');
    console.log(new Date().toISOString(), 'Starting trading engine...');
    await this.tradingEngine.runMorningStrategy();
    console.log('Daily trading strategy completed.');
    // console.log('Stopping the scheduler service...');
    // process.exit(0);
  }

  @Cron('02 30 17 * * *', { timeZone: 'Asia/Kolkata' })
  // @Timeout(15000)
  async runStopLossAt21() {
    console.log('Running daily stop loss placement...');
    console.log(
      new Date().toISOString(),
      'Starting stop loss placement in trading engine...',
    );
    await this.tradingEngine.placeStopLoss();
    console.log('Daily stop loss placement completed.');
    console.log('Stopping the scheduler service...');
    process.exit(0);
  }
}
