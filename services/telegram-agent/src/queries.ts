import { db } from './db';

export async function getStats() {
  const r = await db.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE current_price IS NOT NULL) AS with_price,
      AVG(current_price) FILTER (WHERE current_price IS NOT NULL) AS avg_price,
      MIN(current_price) FILTER (WHERE current_price IS NOT NULL) AS min_price,
      MAX(current_price) FILTER (WHERE current_price IS NOT NULL) AS max_price
    FROM properties
  `);
  return r.rows[0];
}

export async function getZipSummary() {
  const r = await db.query(`
    SELECT zip_code, COUNT(*) AS count,
           AVG(current_price) AS avg_price,
           MIN(current_price) AS min_price,
           MAX(current_price) AS max_price
    FROM properties
    WHERE zip_code IS NOT NULL
    GROUP BY zip_code
    ORDER BY count DESC
    LIMIT 15
  `);
  return r.rows;
}

export async function searchProperties(opts: {
  zip?: string;
  maxPrice?: number;
  minPrice?: number;
  beds?: number;
  type?: string;
  limit?: number;
}) {
  const conds: string[] = [];
  const vals: any[] = [];
  let i = 1;

  if (opts.zip) { conds.push(`zip_code = $${i++}`); vals.push(opts.zip); }
  if (opts.minPrice) { conds.push(`current_price >= $${i++}`); vals.push(opts.minPrice); }
  if (opts.maxPrice) { conds.push(`current_price <= $${i++}`); vals.push(opts.maxPrice); }
  if (opts.beds) { conds.push(`(details->>'beds')::int >= $${i++}`); vals.push(opts.beds); }
  if (opts.type) { conds.push(`property_type ILIKE $${i++}`); vals.push(`%${opts.type}%`); }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const lim = Math.min(opts.limit || 5, 10);

  const r = await db.query(
    `SELECT address, zip_code, current_price, property_type, status, details
     FROM properties ${where}
     ORDER BY current_price ASC NULLS LAST
     LIMIT ${lim}`,
    vals
  );
  return r.rows;
}

export async function getRecentJobs() {
  const r = await db.query(`
    SELECT j.status, j.zip_codes, j.records_scraped, j.started_at, d.display_name
    FROM scrape_jobs j
    LEFT JOIN data_sources d ON j.source_id = d.id
    ORDER BY j.created_at DESC LIMIT 5
  `);
  return r.rows;
}
