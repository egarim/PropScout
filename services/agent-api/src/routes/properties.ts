import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { search, zip, min_price, max_price, limit = 50, offset = 0 } = req.query as any;

  const conditions: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (search) { conditions.push(`p.address ILIKE $${i++}`); values.push(`%${search}%`); }
  if (zip)    { conditions.push(`p.zip_code = $${i++}`); values.push(zip); }
  if (min_price) { conditions.push(`p.current_price >= $${i++}`); values.push(Number(min_price)); }
  if (max_price) { conditions.push(`p.current_price <= $${i++}`); values.push(Number(max_price)); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRow] = await Promise.all([
    db.query(
      `SELECT p.*,
              (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
              pi.url AS cover_image
       FROM properties p
       LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
       ${where}
       ORDER BY p.last_scraped_at DESC
       LIMIT $${i} OFFSET $${i+1}`,
      [...values, Number(limit), Number(offset)]
    ),
    db.query(`SELECT COUNT(*) FROM properties p ${where}`, values),
  ]);

  res.json({
    data: rows.rows,
    total: parseInt(countRow.rows[0].count),
    limit: Number(limit),
    offset: Number(offset),
  });
});

// GET /properties/nearby?lat=&lng=&radius_km=&limit= — haversine, no PostGIS needed
router.get('/nearby', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'lat and lng required' });
  const radiusKm = Math.min(Number(req.query.radius_km) || 10, 100);
  const limit = Math.min(Number(req.query.limit) || 8, 15);

  const r = await db.query(
    `SELECT * FROM (
       SELECT p.id, p.address, p.zip_code, p.current_price, p.status, p.lat, p.lng,
              p.details->>'beds' AS beds, p.details->>'baths' AS baths, p.details->>'sqFt' AS sqft,
              (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
              pi.url AS cover_image,
              ROUND((6371 * acos(LEAST(1,
                cos(radians($1)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians($2))
                + sin(radians($1)) * sin(radians(p.lat)))))::numeric, 1) AS distance_km
       FROM properties p
       LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
       WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
         AND p.current_price IS NOT NULL AND p.status IS DISTINCT FROM 'inactive'
     ) t
     WHERE distance_km <= $3
     ORDER BY distance_km ASC LIMIT $4`,
    [lat, lng, radiusKm, limit]
  );
  res.json({ data: r.rows });
});

router.get('/:id', async (req: Request, res: Response) => {
  const [prop, images, context] = await Promise.all([
    db.query('SELECT * FROM properties WHERE id = $1', [req.params.id]),
    db.query('SELECT * FROM property_images WHERE property_id = $1 ORDER BY is_primary DESC', [req.params.id]),
    // Market context: $/sqft vs zip median, price-cut history, raw_data extras
    db.query(
      `SELECT
         (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
         (p.raw_data->'hdpData'->'homeInfo'->>'taxAssessedValue')::numeric AS tax_assessed,
         p.raw_data->>'brokerName' AS broker,
         p.raw_data->>'yearBuilt' AS year_built,
         p.raw_data->>'description' AS description,
         ROUND(p.current_price / NULLIF((p.details->>'sqFt')::numeric, 0)) AS price_per_sqft,
         (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP
            (ORDER BY z.current_price / NULLIF((z.details->>'sqFt')::numeric, 0)))::numeric)
          FROM properties z
          WHERE z.zip_code = p.zip_code AND z.status IS DISTINCT FROM 'inactive'
            AND z.current_price IS NOT NULL AND (z.details->>'sqFt')::numeric > 0) AS zip_median_ppsqft,
         (SELECT count(*) FROM property_history h
          WHERE h.property_id = p.id AND h.event = 'price_drop') AS price_cuts,
         (SELECT COALESCE(SUM(h.old_price - h.price), 0) FROM property_history h
          WHERE h.property_id = p.id AND h.event = 'price_drop') AS total_cut
       FROM properties p WHERE p.id = $1`,
      [req.params.id]
    ),
  ]);
  if (!prop.rows[0]) return res.status(404).json({ error: 'Not found' });
  const ctx = context.rows[0] || {};
  if (ctx.price_per_sqft && ctx.zip_median_ppsqft) {
    ctx.pct_vs_area = Math.round((ctx.price_per_sqft / ctx.zip_median_ppsqft - 1) * 100);
  }
  res.json({ data: { ...prop.rows[0], ...ctx, images: images.rows } });
});

export default router;
