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

router.get('/:id', async (req: Request, res: Response) => {
  const [prop, images] = await Promise.all([
    db.query('SELECT * FROM properties WHERE id = $1', [req.params.id]),
    db.query('SELECT * FROM property_images WHERE property_id = $1 ORDER BY is_primary DESC', [req.params.id]),
  ]);
  if (!prop.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: { ...prop.rows[0], images: images.rows } });
});

export default router;
