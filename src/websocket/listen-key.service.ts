// src/binance/listen-key.service.ts
import axios from 'axios';
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ListenKeyService implements OnModuleInit, OnModuleDestroy {
  private listenKey!: string;
  private keepAliveTimer!: NodeJS.Timeout;
  private readonly logger = new Logger(ListenKeyService.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    // await this.createListenKey();
    // this.startKeepAlive();
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
  }

  get(): string {
    return this.listenKey;
  }

  async createListenKey() {
    const res = await axios.post(
      this.config.get('BINANCE_BASE_URL') + '/fapi/v1/listenKey',
      null,
      {
        headers: {
          'X-MBX-APIKEY': this.config.get('BINANCE_API_KEY'),
        },
      },
    );

    this.listenKey = res.data.listenKey;
    this.logger.log('ListenKey created:', this.listenKey);
    return this.listenKey;
  }

  startKeepAlive() {
    this.keepAliveTimer = setInterval(
      () => this.keepAlive(),
      30 * 60 * 1000, // 30 minutes
    );
  }

  private async keepAlive() {
    await axios.put(
      this.config.get('BINANCE_BASE_URL') + '/fapi/v1/listenKey',
      null,
      {
        headers: {
          'X-MBX-APIKEY': this.config.get('BINANCE_API_KEY'),
        },
      },
    );

    this.logger.debug('ListenKey kept alive');
  }
}
