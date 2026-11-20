const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Helper: load .env file manually without requiring dotenv package
function loadEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) return;
  const content = fs.readFileSync(envFilePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

// 1. Resolve environment: support --env=<file>, positional arguments (local, dev, prod), or default
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const isProdArg = process.argv.some((arg) => ['prod', 'production', '--production', 'neon'].includes(arg.toLowerCase()));
const isDevArg = process.argv.some((arg) => ['dev', 'development', '--dev', '--development'].includes(arg.toLowerCase()));
const isLocalArg = process.argv.some((arg) => ['local', '--local'].includes(arg.toLowerCase()));

let targetEnvFile = '.env.production';
if (envArg) {
  targetEnvFile = envArg.split('=')[1];
} else if (isLocalArg) {
  targetEnvFile = '.env';
} else if (isDevArg) {
  targetEnvFile = fs.existsSync(path.join(__dirname, '../.env.development')) ? '.env.development' : '.env';
} else if (isProdArg) {
  targetEnvFile = '.env.production';
} else if (fs.existsSync(path.join(__dirname, '../.env.production'))) {
  targetEnvFile = '.env.production';
} else {
  targetEnvFile = '.env';
}

const resolvedPath = path.isAbsolute(targetEnvFile) ? targetEnvFile : path.join(__dirname, '..', targetEnvFile);
if (fs.existsSync(resolvedPath)) {
  console.log(`Loading environment from: ${resolvedPath}`);
  loadEnvFile(resolvedPath);
} else {
  console.log(`Config file ${resolvedPath} not found, falling back to process.env`);
}

async function resetAndInit() {
  const dbUrl = process.env.DATABASE_URL;
  const isNeonOrCloud = !!(dbUrl && (dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require'))) || process.env.DB_SSL === 'true';

  console.log(`Database target: ${isNeonOrCloud ? 'Neon Serverless PostgreSQL (Cloud)' : 'Local PostgreSQL'}`);

  if (isNeonOrCloud) {
    // Neon PostgreSQL: connect directly to target database using DATABASE_URL with SSL
    const client = new Client({
      connectionString: dbUrl || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'neondb'}`,
      ssl: { rejectUnauthorized: false },
    });

    try {
      await client.connect();
      console.log('✅ Successfully connected to Neon PostgreSQL database.');

      console.log('Clearing existing schema and tables (DROP SCHEMA public CASCADE)...');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
      await client.query('CREATE SCHEMA public;');
      await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER;');
      await client.query('GRANT ALL ON SCHEMA public TO public;');

      console.log('🎉 Neon database schema successfully reset to a clean state!');
      console.log('Tables will automatically be recreated by TypeORM synchronize when the backend starts.');
    } catch (err) {
      console.error('❌ Failed to reset Neon database:', err.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  } else {
    // Local PostgreSQL: connect to 'postgres' system DB to drop and recreate the app DB
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgrespassword',
      database: 'postgres',
    });

    try {
      await client.connect();
      console.log('Connected to default postgres database.');
      const dbName = process.env.DB_NAME || 'mercora_db';

      // Terminate existing connections to dbName
      await client.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid();
      `, [dbName]);

      await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      console.log(`Database "${dbName}" dropped.`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Fresh database "${dbName}" created successfully!`);
    } catch (err) {
      console.error('❌ Failed to reset/initialize local database:', err.message);
      process.exit(1);
    } finally {
      await client.end();
    }
  }
}

resetAndInit();
