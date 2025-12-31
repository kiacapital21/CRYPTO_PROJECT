import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DelayService {
  private logger = new Logger(DelayService.name);
  private readonly IST_OFFSET_MS = (5 * 60 + 30) * 60000; // +5:30 in ms (cached)

  private getIstNow(): Date {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcMs + this.IST_OFFSET_MS);
  }

  private formatTimeWithMs(d: Date): string {
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    const ss = d.getSeconds().toString().padStart(2, '0');
    const ms = d.getMilliseconds().toString().padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  }

  private async waitUntilSameMinuteAtSecond(
    second: number,
    millisecond: number = 0,
  ): Promise<void> {
    const istNow = this.getIstNow();
    const targetTime = istNow.getTime();

    // Calculate target timestamp directly (avoid creating intermediate Date object)
    const targetMs =
      targetTime -
      (istNow.getSeconds() * 1000 + istNow.getMilliseconds()) +
      second * 1000 +
      millisecond;

    if (istNow.getTime() >= targetMs) {
      this.logger.debug(
        `Target time ${second}:${millisecond} already passed this minute`,
      );
      return;
    }

    const delay = targetMs - istNow.getTime();
    const targetDate = new Date(targetMs);

    this.logger.log(
      `Waiting ${delay}ms until IST ${this.formatTimeWithMs(targetDate)}`,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }

  public async delay(): Promise<void> {
    await this.waitUntilSameMinuteAtSecond(59, 100);
  }

  public async delayForStopLoss(): Promise<void> {
    await this.waitUntilSameMinuteAtSecond(60, 1);
  }
}
