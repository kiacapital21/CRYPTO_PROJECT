// ...existing code...
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import WebSocket from 'ws';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class DeltaWsService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket;
  private readonly url = 'wss://socket.india.delta.exchange';
  // private readonly url = 'wss://socket-ind.testnet.deltaex.org';
  private logger = new Logger(DeltaWsService.name);
  private reconnectTimeout = 2000;
  private heartbeatInterval: NodeJS.Timeout;
  private pendingReconnectTimeout: NodeJS.Timeout | null = null;
  private manuallyClosed = false;
  private isConnected = false;

  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  onModuleInit() {
   // this.connect();
  }

  onModuleDestroy() {
    this.manuallyClosed = true;
    this.ws?.close();
    clearInterval(this.heartbeatInterval);
    if (this.pendingReconnectTimeout)
      clearTimeout(this.pendingReconnectTimeout);
  }

  private connect() {
    this.logger.log('Connecting to DeltaExchange WebSocket...');
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.logger.log('WebSocket connected.');
      this.isConnected = true;
      this.manuallyClosed = false;
      this.subscribeToFundingRate();
      this.startHeartbeat();
      this.reconnectTimeout = 2000; // reset backoff
    });

    this.ws.on('message', (msg: any) => {
      this.handleMessage(JSON.parse(msg));
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.logger.warn('WebSocket closed.');
      clearInterval(this.heartbeatInterval);

      if (this.manuallyClosed) {
        this.logger.log('Manual close requested — not reconnecting.');
        return;
      }

      this.logger.warn('Reconnecting...');
      if (this.pendingReconnectTimeout)
        clearTimeout(this.pendingReconnectTimeout);
      this.pendingReconnectTimeout = setTimeout(
        () => this.connect(),
        this.reconnectTimeout,
      );
      this.reconnectTimeout = Math.min(this.reconnectTimeout * 2, 30000);
    });

    this.ws.on('error', (err) => {
      this.logger.error('WebSocket error:', err.message);
    });
  }

  private subscribeToFundingRate() {
    const payload = {
      type: 'subscribe',
      payload: {
        channels: [
          {
            name: 'funding_rate',
            symbols: ['perpetual_futures'],
          },
        ],
      },
    };
    this.ws.send(JSON.stringify(payload));
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  private async handleMessage(event: any) {
    if (event.type !== 'funding_rate') return;

    const symbol = event.symbol;
    const rate = event.funding_rate; // convert to percentage

    await this.cache.set(`funding:${symbol}`, rate); // cache for 3 min

    await this.cache.set(
      'funding_rates',
      {
        ...((await this.cache.get('funding_rates')) || {}),
        [symbol]: rate,
      },
      180000, // TTL optional
    );

    this.logger.verbose(`Funding Update: ${symbol} = ${rate}%`);
  }

  // Public API to close the client programmatically and prevent auto-reconnect
  async stop() {
    this.logger.log('Stopping WebSocket (manual).');
    this.manuallyClosed = true;
    if (this.pendingReconnectTimeout) {
      clearTimeout(this.pendingReconnectTimeout);
      this.pendingReconnectTimeout = null;
    }
    clearInterval(this.heartbeatInterval);
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.close();
        } else {
          this.ws.terminate();
        }
      } catch (err) {
        this.logger.error('Error while stopping ws:', err?.message || err);
      }
    }
    this.isConnected = false;
  }

  // Public API to start/connect (will reconnect if previously manually stopped)
  async start() {
    if (this.isConnected) {
      this.logger.log('WebSocket is already connected.');
      return;
    }
    this.logger.log('Starting WebSocket (manual).');
    this.manuallyClosed = false;
    // ensure any pending reconnect is cleared
    if (this.pendingReconnectTimeout) {
      clearTimeout(this.pendingReconnectTimeout);
      this.pendingReconnectTimeout = null;
    }
    this.connect();
  }

  // Convenience restart: stop then start after short delay
  async restart(delayMs = 500) {
    await this.stop();
    await new Promise((r) => setTimeout(r, delayMs));
    await this.start();
  }
  // Listen for event-emitter 'ws.stop' to stop websocket
  @OnEvent('ws.stop')
  async handleWsStop() {
    this.logger.log("Received 'ws.stop' event — stopping websocket.");
    await this.stop();
  }

  // Listen for event-emitter 'ws.start' to start websocket
  @OnEvent('ws.start')
  async handleWsStart() {
    this.logger.log("Received 'ws.start' event — starting websocket.");
    await this.start();
  }
}
// ...existing code...
