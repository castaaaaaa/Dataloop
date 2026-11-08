/**
 * Optional Seed Script
 * Run manually using `npm run seed` or `npx tsx scripts/seed.ts`.
 * NEVER executed automatically.
 */
import { db } from '../src/lib/db/store';
import { seedDemoData } from '../src/lib/db/seed';

console.log('Seeding optional demo data into store...');
seedDemoData(db);
console.log('Demo seed completed successfully.');
console.log(`- Workspaces: ${db.workspaces.length}`);
console.log(`- Connected accounts: ${db.accounts.length}`);
console.log(`- Sync pipelines: ${db.syncConfigs.length}`);
