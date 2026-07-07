import { describe, expect, it } from 'vitest';

import {
  parseEnvExampleLine,
  parsePostgresServiceEnv,
  postgresHealthcheckCommand,
} from '../utils/infra-env.js';

describe('infra env parsing', () => {
  it('parses plain and default-value env example lines', () => {
    expect(parseEnvExampleLine('REDIS_URL=redis://localhost:6379/0')).toEqual({
      key: 'REDIS_URL',
      value: 'redis://localhost:6379/0',
    });
    expect(
      parseEnvExampleLine(
        'RAPIDKIT_DB_POSTGRES_URL=${RAPIDKIT_DB_POSTGRES_URL:-postgresql://postgres:postgres@localhost:5432/app_db}'
      )
    ).toEqual({
      key: 'RAPIDKIT_DB_POSTGRES_URL',
      value: 'postgresql://postgres:postgres@localhost:5432/app_db',
    });
  });

  it('derives postgres service env and healthcheck from workspace connection URL', () => {
    const env = parsePostgresServiceEnv({
      RAPIDKIT_DB_POSTGRES_URL: 'postgresql://postgres:postgres@localhost:5432/app_db',
    });
    expect(env).toEqual({
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
      POSTGRES_DB: 'app_db',
    });
    expect(postgresHealthcheckCommand(env!)).toEqual([
      'CMD-SHELL',
      'pg_isready -U postgres -d app_db',
    ]);
  });
});
