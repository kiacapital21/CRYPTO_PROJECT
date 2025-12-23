import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DeltaExchangeModule } from './deltaExchange/delta-exchange.module';
import { CacheModule } from '@nestjs/cache-manager';
import { WsModule } from './websocket/ws.module';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    CacheModule.register({
      ttl: 3 * 60 * 1000, // 3 min TTL
      max: 5000, // up to 5000 symbols
      isGlobal: true,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DeltaExchangeModule,
    WsModule,
    ScheduleModule.forRoot(),
    SchedulerModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
