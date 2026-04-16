// run-migration.mjs — Run once to apply 002_claim_explainability migration
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import 'dotenv/config';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'shieldpay',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

const sql = readFileSync(
  join(__dirname, 'src/db/migrations/002_claim_explainability.sql'),
  'utf8'
);

try {
  await pool.query(sql);
  console.log('✅  Migration 002_claim_explainability applied successfully');
} catch (err) {
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}
