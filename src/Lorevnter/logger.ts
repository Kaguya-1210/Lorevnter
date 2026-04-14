// ============================================================
// Lorevnter - 日志模块
// 带缓冲区的分级日志系统，支持模块来源标注
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown;
}

/** 缓冲区上限 */
const MAX_BUFFER_SIZE = 200;

/** 日志缓冲区（运行时，不持久化） */
const logBuffer: LogEntry[] = [];

/** 调试模式标志 */
let debugMode = false;

/** 供外部读取缓冲区（只读） */
export function getLogBuffer(): readonly LogEntry[] {
  return logBuffer;
}

/** 清空缓冲区 */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}

export function setDebugMode(on: boolean) {
  debugMode = on;
}

export function isDebugMode(): boolean {
  return debugMode;
}

/**
 * 核心日志函数
 * - error/warn: 始终输出到 console + 缓冲
 * - info: 始终输出到 console + 缓冲
 * - debug: 仅 debugMode=true 时输出到 console + 缓冲
 */
function log(level: LogLevel, source: string, message: string, data?: unknown): void {
  // debug 级别在非调试模式下静默
  if (level === 'debug' && !debugMode) return;

  const entry: LogEntry = {
    timestamp: Date.now(),
    level,
    source,
    message,
    ...(debugMode && data !== undefined ? { data } : {}),
  };

  // 写入缓冲区
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }

  // 输出到控制台
  const prefix = `[Lorevnter/${source}]`;
  const args = data !== undefined && debugMode ? [prefix, message, data] : [prefix, message];

  switch (level) {
    case 'error':
      console.error(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'debug':
      console.debug(...args);
      break;
    default:
      console.log(...args);
      break;
  }
}

/** Logger 接口 */
export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

/**
 * 创建带来源标注的 Logger 实例
 *
 * @example
 * const logger = createLogger('core');
 * logger.info('世界书已加载');
 * logger.debug('条目数据', entries);
 */
export function createLogger(source: string): Logger {
  return {
    debug: (message: string, data?: unknown) => log('debug', source, message, data),
    info: (message: string, data?: unknown) => log('info', source, message, data),
    warn: (message: string, data?: unknown) => log('warn', source, message, data),
    error: (message: string, data?: unknown) => log('error', source, message, data),
  };
}
