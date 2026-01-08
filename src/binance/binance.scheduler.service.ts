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

  startAll() {
    this.logger.log('Starting all cron jobs');
    this.schedulerRegistry.getCronJobs().forEach((job, name) => {
      job.start();
      this.logger.log(`Started cron job: ${name}`);
    });
  }

  stopAll() {
    // 🛑 Stop all cron jobs
    this.schedulerRegistry.getCronJobs().forEach((job, name) => {
      job.stop();
      this.logger.log(`Stopped cron job: ${name}`);
    });

    // 🛑 Stop all intervals
    this.schedulerRegistry.getIntervals().forEach((name) => {
      this.schedulerRegistry.deleteInterval(name);
      this.logger.log(`Stopped interval: ${name}`);
    });

    // 🛑 Stop all timeouts
    this.schedulerRegistry.getTimeouts().forEach((name) => {
      this.schedulerRegistry.deleteTimeout(name);
      this.logger.log(`Stopped timeout: ${name}`);
    });

    return 'All scheduler jobs stopped';
  }

  status() {
    return {
      cron: Array.from(this.schedulerRegistry.getCronJobs().entries()).map(
        ([name, job]) => ({
          name,
          running: job.isActive,
          nextDate: job.isActive ? job.nextDate().toISO() : null,
        }),
      ),
    };
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
