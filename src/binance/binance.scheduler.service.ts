import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TradingEngineService } from '../services/trading-engine.service';
import { CronJob } from 'cron';
import { BinanceService } from './binance.service';

interface DynamicCronConfig {
  name: string;
  cron: string;
  handler: 'morning' | 'local';
  timezone?: string; // optional
}

@Injectable()
export class BinanceSchedulerService implements OnModuleInit {
  private logger = new Logger(BinanceSchedulerService.name);
  private readonly timeZone = 'Asia/Kolkata';

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
    private readonly binanceService: BinanceService,
  ) {}

  private handlers: Record<string, () => Promise<void>> = {
    // morning: () => this.runMorningStrategy(),
    local: () => this.runDailyStrategy(),
  };

  private getDynamicCronConfigs(): DynamicCronConfig[] {
    const raw = this.configService.get<string>('BINANCE_DYNAMIC_CRONS');

    if (!raw) return [];

    try {
      return JSON.parse(raw);
    } catch (e) {
      this.logger.error('Invalid DYNAMIC_CRONS JSON');
      return [];
    }
  }

  onModuleInit() {
    const defaultTimezone =
      this.configService.get<string>('CRON_TIMEZONE') || 'Asia/Kolkata';
    const configs = this.getDynamicCronConfigs();

    configs.forEach((config) => {
      const handler = this.handlers[config.handler];

      if (!handler) {
        this.logger.warn(`No handler for ${config.name}`);
        return;
      }

      const job = new CronJob(
        config.cron,
        async () => {
          this.logger.log(`[${config.name}] Started`);
          try {
            await handler();
            this.logger.log(`[${config.name}] Completed`);
          } catch (e) {
            this.logger.error(`[${config.name}] Failed`, e.stack);
          }
        },
        null,
        false,
        config.timezone || defaultTimezone, // ✅ timezone here
      );

      (this.schedulerRegistry as any).addCronJob(config.name, job);
      job.start();

      this.logger.log(
        `✓ Cron registered: ${config.name} -> ${config.cron} (${config.timezone || defaultTimezone})`,
      );
    });
  }

  private running = false;

  // private async runMorningStrategy(): Promise<void> {
  //   if (this.running) return;
  //   this.running = true;
  //   try {
  //     await this.tradingEngine.runMorningStrategy();
  //   } finally {
  //     this.running = false;
  //   }
  // }

  private async runDailyStrategy(): Promise<void> {
    await this.binanceService.runLocalStrategy();
  }
}
