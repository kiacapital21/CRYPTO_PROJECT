import { ConsoleLogger } from '@nestjs/common';

export class CustomLogger extends ConsoleLogger {
  private readonly IST_OFFSET_MS = (5 * 60 + 30) * 60000; // +5:30 in ms

  private ts(): string {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const istTime = new Date(utcMs + this.IST_OFFSET_MS);

    const date = istTime.toLocaleDateString('en-IN'); // Indian date format
    const time = istTime.toLocaleTimeString('en-IN', { hour12: false });
    const ms = istTime.getMilliseconds().toString().padStart(3, '0');

    return `${date} ${time}.${ms}`;
  }

  log(message: any, context?: string) {
    super.log(`${this.ts()} ${message}`, context);
  }
  error(message: any, trace?: string, context?: string) {
    super.error(`${this.ts()} ${message}`, trace, context);
  }
  warn(message: any, context?: string) {
    super.warn(`${this.ts()} ${message}`, context);
  }
  debug(message: any, context?: string) {
    super.debug(`${this.ts()} ${message}`, context);
  }
  verbose(message: any, context?: string) {
    super.verbose(`${this.ts()} ${message}`, context);
  }
}
