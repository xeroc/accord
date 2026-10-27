// log.ts — the daemon's logging facility (winston). Level comes from
// JURAT_LOG_LEVEL (or bare LOG_LEVEL), default "info". Set it to "debug" to
// trace verdict resolution end to end: system/user prompts sent to the LLM,
// ⚒ tool calls + results, and the model's response.
import winston from "winston";

/** winston npm levels, most to least severe. */
export const LOG_LEVELS = ["error", "warn", "info", "http", "verbose", "debug", "silly"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Parse the level from env. Throws on an unknown value — a typo must not
 * silently mute the daemon (or silently flip it to debug).
 */
export function envLogLevel(env: Record<string, string | undefined> = process.env): LogLevel {
  const raw = env.JURAT_LOG_LEVEL ?? env.LOG_LEVEL;
  if (raw === undefined || raw.trim().length === 0) return "info";
  const level = LOG_LEVELS.find((candidate) => candidate === raw.trim().toLowerCase());
  if (level === undefined) {
    throw new Error(
      `JURAT_LOG_LEVEL/LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} — got "${raw}"`,
    );
  }
  return level;
}

/** Build a console logger: `[timestamp] level: message`. */
export function createLogger(level: LogLevel = envLogLevel()): winston.Logger {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf((info) => `[${String(info.timestamp)}] ${info.level}: ${info.message}`),
    ),
    transports: [new winston.transports.Console()],
  });
}

/** Shared daemon logger — import anywhere; level fixed at process start. */
export const logger = createLogger();
