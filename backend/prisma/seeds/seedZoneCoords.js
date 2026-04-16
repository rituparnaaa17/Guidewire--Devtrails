/**
 * prisma/seeds/seedZoneCoords.js
 * Seeds real lat/lon center coordinates into existing zones.
 * Run: node prisma/seeds/seedZoneCoords.js
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Approximate geographic centers for Indian city zones
const ZONE_COORDS = [
  { pattern: /koramangala/i,    lat: 12.9352, lon: 77.6245, radius: 3  },
  { pattern: /bangalore|bengaluru/i, lat: 12.9716, lon: 77.5946, radius: 8  },
  { pattern: /mumbai|bombay/i,  lat: 19.0760, lon: 72.8777, radius: 10 },
  { pattern: /delhi|ncr/i,      lat: 28.6139, lon: 77.2090, radius: 15 },
  { pattern: /chennai/i,        lat: 13.0827, lon: 80.2707, radius: 8  },
  { pattern: /hyderabad/i,      lat: 17.3850, lon: 78.4867, radius: 8  },
  { pattern: /pune/i,          lat: 18.5204, lon: 73.8567, radius: 8  },
  { pattern: /kolkata|calcutta/i, lat: 22.5726, lon: 88.3639, radius: 8 },
  { pattern: /ahmedabad/i,      lat: 23.0225, lon: 72.5714, radius: 8  },
  { pattern: /jaipur/i,         lat: 26.9124, lon: 75.7873, radius: 8  },
  { pattern: /lucknow/i,        lat: 26.8467, lon: 80.9462, radius: 8  },
  { pattern: /surat/i,          lat: 21.1702, lon: 72.8311, radius: 8  },
  { pattern: /velachery/i,      lat: 12.9779, lon: 80.2209, radius: 3  },
  { pattern: /andheri/i,        lat: 19.1136, lon: 72.8697, radius: 4  },
  { pattern: /noida/i,          lat: 28.5355, lon: 77.3910, radius: 6  },
  { pattern: /gurgaon|gurugram/i, lat: 28.4595, lon: 77.0266, radius: 6 },
];

async function run() {
  const zones = await prisma.zone.findMany();
  console.log(`[SeedCoords] Found ${zones.length} zones`);
  let updated = 0;

  for (const zone of zones) {
    const label = `${zone.zoneName} ${zone.city}`.trim();
    const match = ZONE_COORDS.find((c) => c.pattern.test(label));

    if (match) {
      await prisma.zone.update({
        where: { id: zone.id },
        data: { centerLat: match.lat, centerLon: match.lon, radiusKm: match.radius },
      });
      console.log(`  ✅ ${zone.zoneName} → (${match.lat}, ${match.lon}) r=${match.radius}km`);
      updated++;
    } else {
      console.log(`  ⚠  No coords for: ${zone.zoneName} (${zone.city})`);
    }
  }
  console.log(`[SeedCoords] Updated ${updated}/${zones.length} zones`);
  await prisma.$disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
