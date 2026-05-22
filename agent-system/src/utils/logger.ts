// Structured JSON logger

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel =
  LOG_LEVELS[process.env.LOG_LEVEL as LogLevel] ?? LOG_LEVELS.info;

const SERVICE = process.env.SERVICE_NAME || 'agent-system';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

function serialize(args: unknown[]): Record<string, unknown> {
  if (args.length === 0) return {};
  if (args.length === 1 && args[0] !== null && typeof args[0] === 'object' && !(args[0] instanceof Error)) {
    return args[0] as Record<string, unknown>;
  }
  const merged: Record<string, unknown> = {};
  for (const arg of args) {
    if (arg instanceof Error) {
      merged.error = { message: arg.message, stack: arg.stack, name: arg.name };
    } else if (arg !== null && typeof arg === 'object') {
      Object.assign(merged, arg);
    } else {
      merged.extra = arg;
    }
  }
  return merged;
}

function emit(level: LogLevel, message: string, args: unknown[]): void {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    msg: message,
    ...serialize(args),
  });
  if (level === 'error' || level === 'warn') {
    process.stderr.write(entry + '\n');
  } else {
    process.stdout.write(entry + '\n');
  }
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) emit('debug', message, args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) emit('info', message, args);
  },
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) emit('warn', message, args);
  },
  error: (message: string, ...args: unknown[]) => {
    if (shouldLog('error')) emit('error', message, args);
  },
};
