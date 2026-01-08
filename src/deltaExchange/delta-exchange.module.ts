// delta-exchange.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DeltaExchangeService } from './delta-exchange.service';
import { DeltaExchangeController } from './delta-exchange.controller';
import { SchedulerModule } from 'src/scheduler/scheduler.module';

@Module({
  imports: [HttpModule, ConfigModule, forwardRef(() => SchedulerModule)],
  providers: [DeltaExchangeService],
  exports: [DeltaExchangeService],
  controllers: [DeltaExchangeController],
})
export class DeltaExchangeModule {}
