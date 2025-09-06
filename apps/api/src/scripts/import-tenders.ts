#!/usr/bin/env npx tsx

/**
 * Import tender data script for testing the scraper integration
 */

import { join } from 'path';
import { TransformerService } from '../services/scraper/transformer.service';
import { prisma } from '../database/client';

async function importTenders() {
  console.log('🚀 Starting tender import process...');

  // Path to the sample CSV file  
  const csvFilePath = join(process.cwd(), '../../../scraper/tenders_sample.csv');
  console.log(`📁 Reading from: ${csvFilePath}`);

  // Create transformer service
  const transformer = new TransformerService(prisma);

  try {
    // Check if we have a tenant to import to
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true }
    });

    if (!tenant) {
      console.error('❌ No active tenant found. Please create a tenant first.');
      return;
    }

    // Check if we have a user
    const user = await prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true }
    });

    if (!user) {
      console.error('❌ No active user found. Please create a user first.');
      return;
    }

    console.log(`👤 Using tenant: ${tenant.name} (${tenant.id})`);
    console.log(`👤 Using user: ${user.firstName} ${user.lastName} (${user.id})`);

    // Process the scraped data
    console.log('📊 Processing scraped data...');
    const result = await transformer.processScrapedData(
      csvFilePath,
      tenant.id,
      user.id
    );

    console.log('✅ Import completed successfully!');
    console.log(`📈 Results:`);
    console.log(`   - Imported: ${result.imported} tenders`);
    console.log(`   - Updated: ${result.updated} tenders`);
    console.log(`   - Skipped: ${result.skipped} tenders`);

    // Get transformation stats
    console.log('\n📊 Getting transformation statistics...');
    const stats = await transformer.getTransformationStats(tenant.id);
    console.log(`📈 Statistics:`);
    console.log(`   - Total tenders: ${stats.totalTenders}`);
    console.log(`   - Recently scraped: ${stats.recentlyScraped}`);
    console.log(`   - Category breakdown:`);
    stats.categoryBreakdown.forEach((item: any) => {
      console.log(`     * ${item.category}: ${item._count}`);
    });
    console.log(`   - Status breakdown:`);
    stats.statusBreakdown.forEach((item: any) => {
      console.log(`     * ${item.status}: ${item._count}`);
    });

  } catch (error) {
    console.error('❌ Import failed:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
if (require.main === module) {
  importTenders()
    .then(() => {
      console.log('🎉 Import script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Import script failed:', error);
      process.exit(1);
    });
}