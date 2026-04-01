import { Pool } from 'pg';

export const db = new Pool({
  host: process.env.POSTGRES_HOST || '172.18.0.4',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'propscout',
  user: process.env.POSTGRES_USER || 'propscout',
  password: process.env.POSTGRES_PASSWORD || 'PropScout2026!',
  max: 10,
});

export async function testDb(): Promise<boolean> {
  try {
    const r = await db.query('SELECT 1 as ok');
    return r.rows[0].ok === 1;
  } catch {
    return false;
  }
}
