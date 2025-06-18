export type LogMeta = Record<string, unknown>;

function format(level: string, message: string, meta?: LogMeta) {
  const timestamp = new Date().toISOString();
  const logEntry: any = { timestamp, level, message };
  if (meta) {
    logEntry.meta = meta;
  }
  return JSON.stringify(logEntry);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => {
    console.log(format('info', message, meta));
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(format('warn', message, meta));
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(format('error', message, meta));
  },
  debug: (message: string, meta?: LogMeta) => {
    console.debug(format('debug', message, meta));
  },
};
