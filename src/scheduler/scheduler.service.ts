import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TradingEngineService } from '../services/trading-engine.service';
import { CronJob } from 'cron';

interface CronConfig {
  name: string;
  expression: string;
  method: () => Promise<void>;
}

@Injectable()
export class SchedulerService implements OnModuleInit {
  private logger = new Logger(SchedulerService.name);
  private readonly timeZone = 'Asia/Kolkata';

  constructor(
    private readonly tradingEngine: TradingEngineService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  private getCronConfigs(): CronConfig[] {
    console.log(this.configService.get<string>('CRON_STRATEGY_9'));
    console.log(this.configService.get<string>('CRON_STRATEGY_13'));
    console.log(this.configService.get<string>('CRON_STRATEGY_17'));
    console.log(this.configService.get<string>('CRON_STRATEGY_21'));
    console.log(this.configService.get<string>('CRON_STRATEGY_LOCAL'));
    return [
      {
        name: 'strategy9',
        expression:
          this.configService.get<string>('CRON_STRATEGY_9') || '50 29 09 * * *',
        method: () => this.runMorningStrategy(),
      },
      {
        name: 'strategy13',
        expression:
          this.configService.get<string>('CRON_STRATEGY_13') ||
          '50 29 13 * * *',
        method: () => this.runMorningStrategy(),
      },
      {
        name: 'strategy17',
        expression:
          this.configService.get<string>('CRON_STRATEGY_17') ||
          '50 29 17 * * *',
        method: () => this.runMorningStrategy(),
      },
      {
        name: 'strategy21',
        expression:
          this.configService.get<string>('CRON_STRATEGY_21') ||
          '50 29 21 * * *',
        method: () => this.runMorningStrategy(),
      },
      {
        name: 'strategyLocal',
        expression:
          this.configService.get<string>('CRON_STRATEGY_LOCAL') ||
          '50 25 10 * * *',
        method: () => this.runDailyStrategy(),
      },
    ];
  }

  private getCronJobs(config: CronConfig): CronJob {
    return new CronJob(
      config.expression,
      async () => {
        this.logger.log(`[${config.name}] Starting trading strategy...`);
        try {
          await config.method();
          this.logger.log(`[${config.name}] Strategy completed successfully.`);
        } catch (error) {
          this.logger.error(
            `[${config.name}] Strategy failed: ${error.message}`,
            error.stack,
          );
        }
      },
      null,
      false,
      this.timeZone,
    );
  }

  onModuleInit() {
    const cronConfigs: CronConfig[] = this.getCronConfigs();

    cronConfigs.forEach((config) => {
      try {
        const job: CronJob = this.getCronJobs(config) as any;

        (this.schedulerRegistry as any).addCronJob(config.name, job);
        job.start();
        this.logger.log(
          `✓ Registered cron [${config.name}] -> ${config.expression} (${this.timeZone})`,
        );
      } catch (error) {
        this.logger.error(
          `✗ Failed to register cron [${config.name}]: ${error.message}`,
        );
      }
    });

    this.logger.log('All cron jobs initialized.');
  }

  private async runMorningStrategy(): Promise<void> {
    await this.tradingEngine.runMorningStrategy();
  }

  private async runDailyStrategy(): Promise<void> {
    await this.tradingEngine.runLocalStrategy();
  }
}
