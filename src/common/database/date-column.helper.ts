import * as fs from 'fs';
import * as path from 'path';
import {
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  ColumnOptions,
  ValueTransformer,
} from 'typeorm';

export function loadEnvEarly(): void {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), 'apps/backend/.env'),
    path.resolve(process.cwd(), 'apps/backend/.env.local'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../../../apps/backend/.env'),
  ];

  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx !== -1) {
              const k = trimmed.slice(0, idx).trim();
              let v = trimmed.slice(idx + 1).trim();
              if (
                (v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'"))
              ) {
                v = v.slice(1, -1);
              }
              if (process.env[k] === undefined) {
                process.env[k] = v;
              }
            }
          }
        }
      } catch {
        // Silently continue if reading fails
      }
    }
  }
}

// Immediately load environment before evaluating database type
loadEnvEarly();

export const isPostgres = (): boolean =>
  (process.env.DB_TYPE || 'postgres').toLowerCase() !== 'sqlite';

export type TimestampColumnType = 'timestamptz' | 'datetime';

export const TIMESTAMPTZ_TYPE: TimestampColumnType = isPostgres()
  ? 'timestamptz'
  : 'datetime';

export const JSON_COLUMN_TYPE = isPostgres() ? 'jsonb' : 'simple-json';

export const bigintNumberTransformer: ValueTransformer = {
  to: (value: number | null | undefined) =>
    value === undefined ? undefined : value === null ? null : Math.trunc(Number(value)),
  from: (value: string | number | null | undefined) =>
    value === null || value === undefined ? null : Number(value),
};

export function CreateTimestampColumn(options: ColumnOptions = {}) {
  return CreateDateColumn({
    type: TIMESTAMPTZ_TYPE,
    ...options,
  });
}

export function UpdateTimestampColumn(options: ColumnOptions = {}) {
  return UpdateDateColumn({
    type: TIMESTAMPTZ_TYPE,
    ...options,
  });
}

export function DeleteTimestampColumn(options: ColumnOptions = {}) {
  return DeleteDateColumn({
    type: TIMESTAMPTZ_TYPE,
    ...options,
  });
}

export function TimestampColumn(options: ColumnOptions = {}) {
  return Column({
    type: TIMESTAMPTZ_TYPE,
    ...options,
  });
}
