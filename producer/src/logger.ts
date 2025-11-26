/**
 * Simple logger utility for the Producer service.
 * Provides formatted output with timestamps and log levels.
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${this.context}] ${message}`;
  }

  public info(message: string): void {
    console.log(this.formatMessage('INFO', message));
  }

  public warn(message: string): void {
    console.warn(this.formatMessage('WARN', message));
  }

  public error(message: string, error?: any): void {
    const msg = this.formatMessage('ERROR', message);
    console.error(msg);
    if (error) {
      console.error(error);
    }
  }

  public debug(message: string): void {
    // Only log debug messages if explicitly enabled (can be expanded later)
    if (process.env.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message));
    }
  }
}
