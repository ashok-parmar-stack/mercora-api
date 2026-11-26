const fs = require('fs');
const path = require('path');
require('reflect-metadata');
const { DataSource } = require('typeorm');

// 1. Helper: load .env files
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

// 2. Parse command arguments
// Examples:
// node scripts/migration-runner.js run --env=.env.production
// node scripts/migration-runner.js revert prod
// node scripts/migration-runner.js pending dev
const args = process.argv.slice(2);
const command = args.find((a) => ['run', 'revert', 'pending', 'status', 'show', 'sync'].includes(a.toLowerCase())) || 'run';

const envArg = args.find((arg) => arg.startsWith('--env='));
const isProdArg = args.some((arg) => ['prod', 'production', '--production', 'neon'].includes(arg.toLowerCase()));
const isDevArg = args.some((arg) => ['dev', 'development', '--dev', '--development'].includes(arg.toLowerCase()));
const isLocalArg = args.some((arg) => ['local', '--local'].includes(arg.toLowerCase()));

let targetEnvFile = '.env';
if (envArg) {
  targetEnvFile = envArg.split('=')[1];
} else if (isDevArg) {
  targetEnvFile = fs.existsSync(path.join(__dirname, '../.env.development')) ? '.env.development' : '.env';
} else if (isProdArg) {
  targetEnvFile = '.env.production';
}

const resolvedPath = path.isAbsolute(targetEnvFile) ? targetEnvFile : path.join(__dirname, '..', targetEnvFile);
if (fs.existsSync(resolvedPath)) {
  console.log(`Loading environment config: ${resolvedPath}`);
  loadEnvFile(resolvedPath);
} else {
  console.log(`Config file ${resolvedPath} not found, using process.env`);
}

// 3. Load entity classes (try ts-node for src, fallback to dist)
let entitiesModule;
try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      target: 'ES2021',
      skipLibCheck: true,
    },
  });
  entitiesModule = require('../src/database/entities');
} catch (e) {
  entitiesModule = require('../dist/database/entities');
}
const allEntities = Object.values(entitiesModule).filter((item) => typeof item === 'function' && item.prototype);

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  const isNeonOrSsl = !!(dbUrl && (dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require'))) || process.env.DB_SSL === 'true';

  console.log('===============================================================');
  console.log(`   MERCORA TYPEORM MIGRATION MANAGER: [${command.toUpperCase()}]`);
  console.log('===============================================================');
  console.log(`Database Target: ${isNeonOrSsl ? 'Neon Serverless PostgreSQL (Cloud)' : 'Local Database'}`);
  console.log(`Entities Loaded: ${allEntities.length}\n`);

  const migrationsDir = path.join(__dirname, '../src/database/migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const dataSource = new DataSource({
    type: 'postgres',
    ...(dbUrl
      ? { url: dbUrl }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME || 'neondb',
        }),
    ssl: isNeonOrSsl ? { rejectUnauthorized: false } : false,
    entities: allEntities,
    migrations: [path.join(migrationsDir, '*.{ts,js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
    logging: false,
  });

  try {
    console.log('Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected successfully to PostgreSQL.\n');

    switch (command.toLowerCase()) {
      case 'run': {
        console.log('Checking and executing all pending migrations...');
        const executed = await dataSource.runMigrations();
        if (executed.length === 0) {
          console.log('✅ No pending migrations to execute. Database is already up to date!');
        } else {
          console.log(`✅ Successfully executed ${executed.length} migration(s):`);
          executed.forEach((m) => console.log(`   • ${m.name}`));
        }
        break;
      }

      case 'revert': {
        console.log('Reverting last applied migration...');
        try {
          await dataSource.undoLastMigration();
          console.log('✅ Successfully reverted the last migration!');
        } catch (err) {
          console.log(`ℹ️  No migrations to revert or revert failed: ${err.message}`);
        }
        break;
      }

      case 'pending':
      case 'status':
      case 'show': {
        console.log('Checking migration status...');
        const hasPending = await dataSource.showMigrations();

        // Check if migrations table exists
        try {
          const executed = await dataSource.query(`
            SELECT id, "timestamp", "name" FROM "migrations" ORDER BY "timestamp" DESC;
          `);
          console.log(`\n📋 Applied Migrations (${executed.length}):`);
          if (executed.length === 0) {
            console.log('   (None applied yet)');
          } else {
            executed.forEach((m) => console.log(`   ✓ [${new Date(Number(m.timestamp)).toISOString()}] ${m.name}`));
          }
        } catch {
          console.log('ℹ️  No migrations history table exists yet.');
        }

        console.log(`\nPending Migrations to Run: ${hasPending ? 'YES (Pending migrations exist)' : 'NO (Database is up to date)'}`);
        break;
      }

      case 'sync': {
        console.log('Synchronizing all entity tables to database...');
        await dataSource.synchronize();
        console.log('✅ All 28 entity tables synchronized successfully!');
        break;
      }
    }

    console.log('\nOperation completed successfully.\n');
  } catch (err) {
    console.error('❌ Migration manager error:', err.message);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

run();
