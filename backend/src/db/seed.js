/**
 * ShieldPay — Prisma Seed Script
 * Run: node src/db/seed.js
 * Seeds zone + pincode data into PostgreSQL via Prisma.
 */
import prisma from '../config/db.js';

const zones = [
  { zoneName: 'Mumbai Central',     zoneCode: 'MUM-C',   city: 'Mumbai',    state: 'Maharashtra',  riskLevel: 'high',      riskFactor: 1.50, basePremium: 120.00 },
  { zoneName: 'Mumbai Suburbs',     zoneCode: 'MUM-S',   city: 'Mumbai',    state: 'Maharashtra',  riskLevel: 'medium',    riskFactor: 1.20, basePremium: 100.00 },
  { zoneName: 'Delhi NCR Core',     zoneCode: 'DEL-C',   city: 'Delhi',     state: 'Delhi',        riskLevel: 'very_high', riskFactor: 1.80, basePremium: 150.00 },
  { zoneName: 'Delhi Outer Ring',   zoneCode: 'DEL-O',   city: 'Delhi',     state: 'Delhi',        riskLevel: 'high',      riskFactor: 1.45, basePremium: 130.00 },
  { zoneName: 'Bangalore Urban',    zoneCode: 'BLR-U',   city: 'Bangalore', state: 'Karnataka',    riskLevel: 'medium',    riskFactor: 1.15, basePremium:  95.00 },
  { zoneName: 'Bangalore Rural',    zoneCode: 'BLR-R',   city: 'Bangalore', state: 'Karnataka',    riskLevel: 'low',       riskFactor: 0.90, basePremium:  80.00 },
  { zoneName: 'Pune Central',       zoneCode: 'PUN-C',   city: 'Pune',      state: 'Maharashtra',  riskLevel: 'medium',    riskFactor: 1.10, basePremium:  90.00 },
  { zoneName: 'Chennai Central',    zoneCode: 'CHN-C',   city: 'Chennai',   state: 'Tamil Nadu',   riskLevel: 'medium',    riskFactor: 1.20, basePremium: 100.00 },
  { zoneName: 'Chennai Velachery',  zoneCode: 'CHN-VEL', city: 'Chennai',   state: 'Tamil Nadu',   riskLevel: 'high',      riskFactor: 1.35, basePremium: 112.00 },
  { zoneName: 'Hyderabad Central',  zoneCode: 'HYD-C',   city: 'Hyderabad', state: 'Telangana',    riskLevel: 'medium',    riskFactor: 1.18, basePremium:  98.00 },
  { zoneName: 'Kolkata Central',    zoneCode: 'KOL-C',   city: 'Kolkata',   state: 'West Bengal',  riskLevel: 'high',      riskFactor: 1.40, basePremium: 115.00 },
  { zoneName: 'Default Zone',       zoneCode: 'DEFAULT', city: 'Unknown',   state: 'Unknown',      riskLevel: 'medium',    riskFactor: 1.00, basePremium:  95.00 },
];

const pincodes = [
  { pincode: '400001', zoneCode: 'MUM-C',   city: 'Mumbai' },
  { pincode: '400068', zoneCode: 'MUM-S',   city: 'Mumbai' },
  { pincode: '110001', zoneCode: 'DEL-C',   city: 'Delhi' },
  { pincode: '110044', zoneCode: 'DEL-O',   city: 'Delhi' },
  { pincode: '560001', zoneCode: 'BLR-U',   city: 'Bangalore' },
  { pincode: '560083', zoneCode: 'BLR-R',   city: 'Bangalore' },
  { pincode: '411001', zoneCode: 'PUN-C',   city: 'Pune' },
  { pincode: '600001', zoneCode: 'CHN-C',   city: 'Chennai' },
  { pincode: '600042', zoneCode: 'CHN-VEL', city: 'Chennai' },
  { pincode: '500001', zoneCode: 'HYD-C',   city: 'Hyderabad' },
  { pincode: '700001', zoneCode: 'KOL-C',   city: 'Kolkata' },
];

async function main() {
  console.log('🌱 Seeding ShieldPay database...');

  // Upsert zones
  for (const zone of zones) {
    await prisma.zone.upsert({
      where: { zoneCode: zone.zoneCode },
      create: zone,
      update: { riskLevel: zone.riskLevel, riskFactor: zone.riskFactor, basePremium: zone.basePremium },
    });
  }
  console.log(`✅ ${zones.length} zones seeded`);

  // Upsert pincodes
  for (const pc of pincodes) {
    const zone = await prisma.zone.findUnique({ where: { zoneCode: pc.zoneCode } });
    if (!zone) continue;
    await prisma.pincodeZoneMap.upsert({
      where: { pincode: pc.pincode },
      create: { pincode: pc.pincode, zoneId: zone.id, city: pc.city },
      update: { zoneId: zone.id, city: pc.city },
    });
  }
  console.log(`✅ ${pincodes.length} pincodes mapped`);

  console.log('🎉 Seed complete!');
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
