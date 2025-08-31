#!/usr/bin/env tsx
/**
 * Database Setup and Maintenance Script
 * 
 * This script provides comprehensive database management functionality:
 * - Database initialization and migration
 * - Seed data generation
 * - Backup and restore operations
 * - Performance monitoring and optimization
 * - Health checks and diagnostics
 */

import { program } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { prisma, healthCheck, getDatabaseStats, DatabaseMaintenance } from '../src/database';

const execAsync = promisify(exec);

// Command line interface
program
  .name('db-setup')
  .description('TenderFlow Database Management CLI')
  .version('1.0.0');

// Initialize database
program
  .command('init')
  .description('Initialize database with migrations and seed data')
  .option('-s, --seed', 'Run seed data after migrations')
  .option('-f, --force', 'Force reset database (destructive)')
  .action(async (options) => {
    try {
      console.log('🚀 Initializing TenderFlow database...\n');

      if (options.force) {
        console.log('⚠️  Force reset requested - this will destroy all data!');
        await resetDatabase();
      }

      await runMigrations();
      
      if (options.seed) {
        await runSeeds();
      }

      await verifySetup();
      
      console.log('\n✅ Database initialization completed successfully!');
    } catch (error) {
      console.error('\n❌ Database initialization failed:', error);
      process.exit(1);
    }
  });

// Run migrations
program
  .command('migrate')
  .description('Run database migrations')
  .option('-d, --deploy', 'Deploy migrations (production mode)')
  .action(async (options) => {
    try {
      if (options.deploy) {
        await deployMigrations();
      } else {
        await runMigrations();
      }
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  });

// Seed database
program
  .command('seed')
  .description('Seed database with sample data')
  .option('-e, --environment <env>', 'Environment (development|staging|production)', 'development')
  .action(async (options) => {
    try {
      if (options.environment === 'production') {
        console.log('⚠️  Production environment detected. Use with caution!');
        // Add confirmation prompt in real implementation
      }
      
      await runSeeds();
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    }
  });

// Health check
program
  .command('health')
  .description('Check database health and connectivity')
  .option('-v, --verbose', 'Verbose output with detailed statistics')
  .action(async (options) => {
    try {
      await performHealthCheck(options.verbose);
    } catch (error) {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    }
  });

// Backup database
program
  .command('backup')
  .description('Create database backup')
  .option('-o, --output <path>', 'Output file path')
  .option('-c, --compress', 'Compress backup file')
  .action(async (options) => {
    try {
      await createBackup(options.output, options.compress);
    } catch (error) {
      console.error('❌ Backup failed:', error);
      process.exit(1);
    }
  });

// Restore database
program
  .command('restore')
  .description('Restore database from backup')
  .requiredOption('-f, --file <path>', 'Backup file path')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      await restoreBackup(options.file, options.yes);
    } catch (error) {
      console.error('❌ Restore failed:', error);
      process.exit(1);
    }
  });

// Maintenance operations
program
  .command('maintenance')
  .description('Run database maintenance operations')
  .option('-v, --vacuum', 'Run VACUUM ANALYZE')
  .option('-c, --cleanup', 'Clean up old audit logs')
  .option('-a, --archive', 'Archive old tenders')
  .option('-o, --optimize', 'Optimize database performance')
  .action(async (options) => {
    try {
      await runMaintenance(options);
    } catch (error) {
      console.error('❌ Maintenance failed:', error);
      process.exit(1);
    }
  });

// Statistics and monitoring
program
  .command('stats')
  .description('Display database statistics and performance metrics')
  .option('-s, --slow-queries', 'Show slow queries')
  .option('-i, --indexes', 'Show index usage')
  .option('-t, --tables', 'Show table statistics')
  .action(async (options) => {
    try {
      await showStatistics(options);
    } catch (error) {
      console.error('❌ Stats collection failed:', error);
      process.exit(1);
    }
  });

// Reset database (destructive)
program
  .command('reset')
  .description('Reset database (DESTRUCTIVE - removes all data)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (options) => {
    try {
      if (!options.yes) {
        console.log('⚠️  This will destroy ALL data in the database!');
        console.log('Use --yes flag to confirm this destructive operation.');
        return;
      }
      
      await resetDatabase();
      console.log('✅ Database reset completed');
    } catch (error) {
      console.error('❌ Reset failed:', error);
      process.exit(1);
    }
  });

// Implementation functions

async function runMigrations() {
  console.log('📦 Running database migrations...');
  
  try {
    await execAsync('npx prisma migrate deploy');
    console.log('   ✓ Migrations completed successfully');
  } catch (error) {
    // Try development migrations if deploy fails
    console.log('   → Falling back to development migrations...');
    await execAsync('npx prisma migrate dev --skip-generate');
    console.log('   ✓ Development migrations completed');
  }
}

async function deployMigrations() {
  console.log('🚀 Deploying migrations for production...');
  await execAsync('npx prisma migrate deploy');
  console.log('   ✓ Production migrations deployed');
}

async function runSeeds() {
  console.log('🌱 Seeding database...');
  await execAsync('npm run db:seed');
  console.log('   ✓ Seed data created successfully');
}

async function resetDatabase() {
  console.log('🗑️  Resetting database...');
  
  try {
    await execAsync('npx prisma migrate reset --force');
    console.log('   ✓ Database reset completed');
  } catch (error) {
    console.log('   → Using alternative reset method...');
    await execAsync('npx prisma db push --force-reset');
    console.log('   ✓ Database force reset completed');
  }
}

async function verifySetup() {
  console.log('🔍 Verifying database setup...');
  
  const health = await healthCheck();
  if (health.status !== 'healthy') {
    throw new Error(`Database health check failed: ${health.details}`);
  }
  
  // Check if tables exist
  const stats = await getDatabaseStats();
  if (stats && stats.tables.length === 0) {
    throw new Error('No tables found - migration may have failed');
  }
  
  console.log('   ✓ Database setup verified');
}

async function performHealthCheck(verbose: boolean = false) {
  console.log('🔍 Checking database health...\n');
  
  const health = await healthCheck();
  
  console.log(`Status: ${health.status === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}`);
  
  if (health.details) {
    console.log(`Details: ${health.details}`);
  }
  
  if (verbose && health.status === 'healthy') {
    console.log('\n📊 Detailed Statistics:');
    
    const stats = await getDatabaseStats();
    if (stats) {
      console.log('\n📋 Table Statistics:');
      stats.tables.forEach(table => {
        console.log(`   ${table.table_name}: ${table.row_count.toLocaleString()} operations`);
      });
      
      console.log('\n🔍 Index Usage (Top 5):');
      stats.indexes.slice(0, 5).forEach(index => {
        console.log(`   ${index.table_name}.${index.index_name}: ${index.index_scans.toLocaleString()} scans`);
      });
      
      if (stats.connections) {
        console.log(`\n🔗 Active Connections: ${stats.connections.activeConnections}`);
      }
    }
    
    // Check slow queries
    const slowQueries = await DatabaseMaintenance.analyzeSlowQueries(5);
    if (slowQueries.length > 0) {
      console.log('\n⚠️  Slow Queries Detected:');
      slowQueries.forEach((query, index) => {
        console.log(`   ${index + 1}. ${query.mean_exec_time.toFixed(2)}ms avg (${query.calls} calls)`);
        console.log(`      ${query.query.substring(0, 100)}...`);
      });
    }
  }
  
  console.log(`\nHealth check completed at ${new Date().toISOString()}`);
}

async function createBackup(outputPath?: string, compress: boolean = false) {
  console.log('💾 Creating database backup...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultPath = `./backups/tenderflow-backup-${timestamp}.sql`;
  const backupPath = outputPath || defaultPath;
  
  // Ensure backup directory exists
  await fs.mkdir(path.dirname(backupPath), { recursive: true });
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  
  const compressFlag = compress ? ' | gzip' : '';
  const extension = compress ? '.gz' : '';
  const finalPath = backupPath + extension;
  
  const command = `pg_dump "${databaseUrl}" --no-owner --no-privileges${compressFlag} > "${finalPath}"`;
  
  await execAsync(command);
  
  const stats = await fs.stat(finalPath);
  console.log(`   ✓ Backup created: ${finalPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

async function restoreBackup(filePath: string, skipConfirmation: boolean = false) {
  if (!skipConfirmation) {
    console.log('⚠️  This will replace ALL existing data!');
    console.log('Use --yes flag to confirm this destructive operation.');
    return;
  }
  
  console.log('📥 Restoring database backup...');
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  
  // Check if file is compressed
  const isCompressed = filePath.endsWith('.gz');
  const command = isCompressed
    ? `gunzip -c "${filePath}" | psql "${databaseUrl}"`
    : `psql "${databaseUrl}" < "${filePath}"`;
  
  await execAsync(command);
  console.log('   ✓ Backup restored successfully');
  
  // Verify restoration
  await verifySetup();
}

async function runMaintenance(options: any) {
  console.log('🔧 Running database maintenance...\n');
  
  if (options.vacuum) {
    console.log('🧹 Running VACUUM ANALYZE...');
    const result = await DatabaseMaintenance.vacuumAnalyze();
    if (result.success) {
      console.log('   ✓ VACUUM ANALYZE completed');
    } else {
      console.log(`   ❌ VACUUM ANALYZE failed: ${result.error}`);
    }
  }
  
  if (options.cleanup) {
    console.log('🗑️  Cleaning up old audit logs...');
    const count = await DatabaseMaintenance.cleanupAuditLogs();
    console.log(`   ✓ Cleaned up ${count} old audit log entries`);
  }
  
  if (options.archive) {
    console.log('📦 Archiving old tenders...');
    const count = await DatabaseMaintenance.archiveOldTenders();
    console.log(`   ✓ Archived ${count} old tenders`);
  }
  
  if (options.optimize) {
    console.log('⚡ Optimizing database performance...');
    
    // Update table statistics
    await execAsync('npx prisma db execute --stdin <<< "ANALYZE;"');
    console.log('   ✓ Table statistics updated');
    
    // Check for unused indexes
    const slowQueries = await DatabaseMaintenance.analyzeSlowQueries();
    if (slowQueries.length > 0) {
      console.log(`   ⚠️  Found ${slowQueries.length} slow queries that may need optimization`);
    } else {
      console.log('   ✓ No slow queries detected');
    }
  }
  
  console.log('\n✅ Maintenance completed successfully');
}

async function showStatistics(options: any) {
  console.log('📊 Database Statistics\n');
  
  const stats = await getDatabaseStats();
  
  if (!stats) {
    console.log('Unable to collect statistics');
    return;
  }
  
  if (options.tables || (!options.slowQueries && !options.indexes)) {
    console.log('📋 Table Statistics:');
    console.log('┌─────────────────────────────┬─────────────────┐');
    console.log('│ Table Name                  │ Operation Count │');
    console.log('├─────────────────────────────┼─────────────────┤');
    
    stats.tables.forEach(table => {
      const name = table.table_name.padEnd(27);
      const count = table.row_count.toLocaleString().padStart(15);
      console.log(`│ ${name} │ ${count} │`);
    });
    
    console.log('└─────────────────────────────┴─────────────────┘\n');
  }
  
  if (options.indexes) {
    console.log('🔍 Index Usage Statistics:');
    console.log('┌─────────────────────┬─────────────────────┬─────────────┐');
    console.log('│ Table               │ Index               │ Scans       │');
    console.log('├─────────────────────┼─────────────────────┼─────────────┤');
    
    stats.indexes.slice(0, 10).forEach(index => {
      const table = index.table_name.padEnd(19);
      const indexName = index.index_name.padEnd(19);
      const scans = index.index_scans.toLocaleString().padStart(11);
      console.log(`│ ${table} │ ${indexName} │ ${scans} │`);
    });
    
    console.log('└─────────────────────┴─────────────────────┴─────────────┘\n');
  }
  
  if (options.slowQueries) {
    const slowQueries = await DatabaseMaintenance.analyzeSlowQueries();
    
    if (slowQueries.length > 0) {
      console.log('⚠️  Slow Queries (Top 10):');
      console.log('┌─────┬──────────────┬─────────┬─────────────────┐');
      console.log('│ #   │ Avg Time(ms) │ Calls   │ Query Preview   │');
      console.log('├─────┼──────────────┼─────────┼─────────────────┤');
      
      slowQueries.slice(0, 10).forEach((query, index) => {
        const num = (index + 1).toString().padStart(3);
        const time = query.mean_exec_time.toFixed(1).padStart(12);
        const calls = query.calls.toLocaleString().padStart(7);
        const preview = query.query.substring(0, 50).padEnd(50);
        console.log(`│ ${num} │ ${time} │ ${calls} │ ${preview}...│`);
      });
      
      console.log('└─────┴──────────────┴─────────┴─────────────────┘\n');
    } else {
      console.log('✅ No slow queries detected\n');
    }
  }
  
  if (stats.connections) {
    console.log(`🔗 Active Connections: ${stats.connections.activeConnections}`);
  }
  
  console.log(`\nStatistics generated at: ${stats.timestamp.toISOString()}`);
}

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  program.parse();
}