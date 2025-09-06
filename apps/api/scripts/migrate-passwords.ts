#!/usr/bin/env tsx
/**
 * Script to migrate existing users to use password hashes
 * This is a one-time migration script for security upgrade
 */

import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function migratePasswords() {
  console.log('🔐 Starting password migration...');
  
  try {
    // Find all users without password hashes
    const usersWithoutPasswords = await prisma.user.findMany({
      where: {
        passwordHash: null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (usersWithoutPasswords.length === 0) {
      console.log('✅ All users already have password hashes');
      return;
    }

    console.log(`📋 Found ${usersWithoutPasswords.length} users without password hashes`);

    // For security, we'll set a temporary password that forces users to reset
    const tempPasswordHash = await bcrypt.hash('TEMP_PASSWORD_REQUIRES_RESET', 12);

    // Update all users with temporary password hashes
    const updatePromises = usersWithoutPasswords.map(user => 
      prisma.user.update({
        where: { id: user.id },
        data: { 
          passwordHash: tempPasswordHash,
          // Add a flag in settings to force password reset
          settings: {
            requirePasswordReset: true,
            migrationDate: new Date().toISOString(),
          },
        },
      })
    );

    await Promise.all(updatePromises);

    console.log(`✅ Successfully updated ${usersWithoutPasswords.length} users with temporary password hashes`);
    console.log('⚠️  IMPORTANT: All existing users must reset their passwords before they can log in');
    console.log('');
    console.log('📝 Users that need to reset passwords:');
    usersWithoutPasswords.forEach(user => {
      console.log(`  - ${user.email} (${user.firstName} ${user.lastName})`);
    });
    
  } catch (error) {
    console.error('❌ Error during password migration:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migratePasswords();