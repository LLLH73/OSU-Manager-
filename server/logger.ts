import fs from 'node:fs';
import path from 'node:path';
import { LOGS_DIR } from './config.js';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

const MAX_LOG_BYTES = 2 * 1024 * 1024;
const LOG_FILE = path.join(LOGS_DIR, 'server.log');
const BACKUP_LOG_FILE = path.join(LOGS_DIR, 'server.log.1');

function formatMeta(meta?: Record<string, unknown>): string {
  if (!meta) return '';
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '';
  try {
    return ` ${JSON.stringify(Object.fromEntries(entries))}`;
  } catch {
    return '';
  }
}

function rotateIfNeeded(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_LOG_BYTES) return;
    if (fs.existsSync(BACKUP_LOG_FILE)) {
      fs.unlinkSync(BACKUP_LOG_FILE);
    }
    fs.renameSync(LOG_FILE, BACKUP_LOG_FILE);
  } catch {
    // Ignore rotation errors
  }
}

function writeLine(level: LogLevel, scope: string, msg: string, meta?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] [${level}] [${scope}] ${msg}${formatMeta(meta)}`;
  if (level === 'ERROR') {
    console.error(line);
  } else if (level === 'WARN') {
    console.warn(line);
  } else {
    console.log(line);
  }

  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
  } catch {
    // Ignore file write errors so logging can never crash the server
  }
}

export function logInfo(scope: string, msg: string, meta?: Record<string, unknown>): void {
  writeLine('INFO', scope, msg, meta);
}

export function logWarn(scope: string, msg: string, meta?: Record<string, unknown>): void {
  writeLine('WARN', scope, msg, meta);
}

export function logError(scope: string, msg: string, meta?: Record<string, unknown>): void {
  writeLine('ERROR', scope, msg, meta);
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

export function readRecentLogs(maxLines = 120): string[] {
  const clamped = Math.min(500, Math.max(1, Math.floor(maxLines || 120)));
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const raw = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trimEnd())
      .filter(Boolean);
    return lines.slice(-clamped);
  } catch {
    return [];
  }
}
