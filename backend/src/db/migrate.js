// src/db/migrate.js — Apply pending SQL migrations in order
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const MIGRATIONS = [
  'migrations/002_claim_explainability.sql',
];

const run = async () => {
  for (const file of MIGRATIONS) {
    const sql = readFileSync(join(__dirname, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`✅  Applied: ${file}`);
    } catch (err) {
      console.error(`❌  Failed: ${file} —`, err.message);
      process.exit(1);
    }
  }
  await pool.end();
  console.log('All migrations complete.');
};

run();
