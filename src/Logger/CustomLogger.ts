import { ConsoleLogger } from '@nestjs/common';

export class CustomLogger extends ConsoleLogger {
  private ts(): string {
    const d = new Date();
    const date = d.toLocaleDateString();
    const time = d.toLocaleTimeString('en-GB', { hour12: false });
    const ms = d.getMilliseconds().toString().padStart(3, '0');
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
