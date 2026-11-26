const fs = require('fs');
const path = require('path');
require('reflect-metadata');
const { DataSource } = require('typeorm');
const bcrypt = require('bcrypt');

// 1. Helper: Load environment file manually
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

// 2. Resolve environment: support --env=<file>, positional arguments (local, dev, prod), or default
const envArg = process.argv.find((arg) => arg.startsWith('--env='));
const isProdArg = process.argv.some((arg) => ['prod', 'production', '--production', 'neon'].includes(arg.toLowerCase()));
const isDevArg = process.argv.some((arg) => ['dev', 'development', '--dev', '--development'].includes(arg.toLowerCase()));
const isLocalArg = process.argv.some((arg) => ['local', '--local'].includes(arg.toLowerCase()));

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
  console.log(`Loading environment config from: ${resolvedPath}`);
  loadEnvFile(resolvedPath);
} else {
  console.log(`Config file ${resolvedPath} not found, falling back to process.env`);
}

// 3. Load entity classes (prefer src via ts-node, fallback to dist)
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
  console.log('Loaded entity definitions directly from TypeScript src/database/entities.');
} catch (e) {
  entitiesModule = require('../dist/database/entities');
  console.log('Loaded entity definitions from compiled dist/database/entities.');
}
const allEntities = Object.values(entitiesModule).filter((item) => typeof item === 'function' && item.prototype);

async function migrateAllTables() {
  const dbUrl = process.env.DATABASE_URL;
  const isNeonOrSsl = !!(dbUrl && (dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require'))) || process.env.DB_SSL === 'true';

  console.log('===============================================================');
  console.log('   MERCORA DATABASE MIGRATION ENGINE (ALL TABLES)              ');
  console.log('===============================================================');
  console.log(`Database Target: ${isNeonOrSsl ? 'Neon Serverless PostgreSQL (Cloud)' : 'Local Database'}`);
  console.log(`Entities to Migrate: ${allEntities.length} entities loaded from dist/database/entities\n`);

  const dataSource = new DataSource({
    type: 'postgres',
    ...(dbUrl
      ? { url: dbUrl }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          username: process.env.DB_USER || 'neondb_owner',
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME || 'neondb',
        }),
    ssl: isNeonOrSsl ? { rejectUnauthorized: false } : false,
    entities: allEntities,
    synchronize: false, // We explicitly call .synchronize() below
    logging: false,
  });

  try {
    console.log('Connecting to database...');
    await dataSource.initialize();
    console.log('✅ Connected successfully to PostgreSQL.');

    // Clean up any removed geographic tables if present
    await dataSource.query(`
      DROP TABLE IF EXISTS "post-offices", "postal-codes", "localities", "cities" CASCADE;
    `).catch(() => {});

    console.log('Synchronizing schema & creating all tables...');
    await dataSource.synchronize();
    console.log('✅ All entity tables, relations, and indexes synchronized successfully!\n');

    // Query information_schema to verify tables in Neon
    const tables = await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log(`📋 Total Tables Created in Neon: ${tables.length}`);
    tables.forEach((t, i) => {
      console.log(`   ${(i + 1).toString().padStart(2, ' ')}. ${t.table_name}`);
    });

    // 4. Seed Essential Baseline Data (Statuses & Roles)
    console.log('\n--- Seeding Baseline Master Data ---');

    // Seed Statuses
    const statusRepo = dataSource.getRepository(entitiesModule.StatusEntity);
    const existingStatuses = await statusRepo.count();
    let activeStatus = null;

    if (existingStatuses === 0) {
      console.log('Creating default system statuses...');
      const statusesToSeed = [
        { type: 'USER', code: 'ACTIVE', name: 'Active', isActive: true, sortOrder: 1 },
        { type: 'USER', code: 'INACTIVE', name: 'Inactive', isActive: true, sortOrder: 2 },
        { type: 'USER', code: 'SUSPENDED', name: 'Suspended', isActive: true, sortOrder: 3 },
        { type: 'ROLE', code: 'ACTIVE', name: 'Active', isActive: true, sortOrder: 1 },
        { type: 'ROLE', code: 'INACTIVE', name: 'Inactive', isActive: true, sortOrder: 2 },
      ];
      const createdStatuses = await statusRepo.save(statusRepo.create(statusesToSeed));
      activeStatus = createdStatuses.find((s) => s.type === 'ROLE' && s.code === 'ACTIVE');
      console.log(`✅ Seeded ${createdStatuses.length} base statuses.`);
    } else {
      activeStatus = await statusRepo.findOne({ where: { type: 'ROLE', code: 'ACTIVE' } });
    }

    // Seed System Roles
    const roleRepo = dataSource.getRepository(entitiesModule.RoleEntity);
    const existingRoles = await roleRepo.count();

    if (existingRoles === 0) {
      console.log('Creating default system roles...');
      const defaultRoles = [
        { code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'Full root access to all system features', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
        { code: 'ADMIN', name: 'Administrator', description: 'Administrative management for organization', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
        { code: 'DATA_MANAGER', name: 'Data Manager', description: 'Manages catalog, geography and masters', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
        { code: 'SALES', name: 'Sales Representative', description: 'Manages deals, leads, and client interactions', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
        { code: 'CUSTOMER', name: 'Customer / Buyer', description: 'Standard platform customer user', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
        { code: 'VIEWER', name: 'Read-only Viewer', description: 'Read-only access across allowed resources', isSystem: true, statusId: activeStatus ? activeStatus.id : null },
      ];
      await roleRepo.save(roleRepo.create(defaultRoles));
      console.log(`✅ Seeded ${defaultRoles.length} system roles (SUPER_ADMIN, ADMIN, DATA_MANAGER, SALES, CUSTOMER, VIEWER).`);
    }

    // Display sample seeded roles and statuses with their new IDs
    const seededRoles = await dataSource.query(`SELECT id, code, name FROM roles ORDER BY id ASC;`);
    console.log('\n📋 Roles in Database (Auto-Increment BigInt):');
    seededRoles.forEach((r) => console.log(`   ID: ${r.id} | Code: ${r.code} | Name: ${r.name}`));

    const seededStatuses = await dataSource.query(`SELECT id, type, code FROM statuses ORDER BY id ASC;`);
    console.log('\n📋 Statuses in Database (Auto-Increment BigInt):');
    seededStatuses.forEach((s) => console.log(`   ID: ${s.id} | Type: ${s.type} | Code: ${s.code}`));

    console.log('\n🎉 ALL TABLES AND BASE DATA ARE READY IN NEON DATABASE!\n');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

migrateAllTables();
