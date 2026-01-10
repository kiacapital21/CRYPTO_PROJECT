// src/binance/binance-user-ws.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import WebSocket from 'ws';
import { FundingState } from './funding-state';
import { ListenKeyService } from './listen-key.service';

@Injectable()
export class BinanceUserWsService implements OnModuleInit {
  private readonly logger = new Logger(BinanceUserWsService.name);
  private ws!: WebSocket;

  constructor(
    private readonly fundingState: FundingState,
    private listenKeyService: ListenKeyService,
  ) {}

  onModuleInit() {
    // this.connect();
  }

  async connect() {
    const listenKey = await this.listenKeyService.createListenKey();
    this.listenKeyService.startKeepAlive();
    console.log('listenKey:', listenKey);
    // const url = `wss://fstream.binancefuture.com/ws/${listenKey}`;
    const url = `wss://fstream.binance.com/ws/${listenKey}`;
    this.ws = new WebSocket(url);
    console.log('WS connected for account updates.');
    this.ws.on('message', (msg) => this.handle(JSON.parse(msg.toString())));

    this.ws.on('close', () => {
      this.logger.warn('WS closed');
      // setTimeout(() => this.connect(), 1000);
    });
    this.ws.on('error', (err) => {
      this.logger.error('WS error', err);
      this.ws?.close();
    });
  }

  stop() {
    this.ws?.close();
  }

  private handle(event: any) {
    if (event.e === 'ACCOUNT_UPDATE') {
      console.log('Event:', JSON.stringify(event));
    }
    if (event.e === 'ACCOUNT_UPDATE' && event.m == 'FUNDING_FEE') {
      console.log('FUNDING Event:', JSON.stringify(event));
      this.fundingState.onAccountUpdate(event);
    }
  }
}
