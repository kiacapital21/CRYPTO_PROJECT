// delta-exchange.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DeltaExchangeService } from './delta-exchange.service';
import { DeltaExchangeController } from './delta-exchange.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [DeltaExchangeService],
  exports: [DeltaExchangeService],
  controllers: [DeltaExchangeController],
})
export class DeltaExchangeModule {}
