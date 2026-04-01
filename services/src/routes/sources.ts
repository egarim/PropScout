import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const result = await db.query('SELECT * FROM data_sources ORDER BY name');
  res.json({ data: result.rows });
});

router.get('/:id', async (req: Request, res: Response) => {
  const result = await db.query('SELECT * FROM data_sources WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: result.rows[0] });
});

router.post('/', async (req: Request, res: Response) => {
  const { name, display_name, config } = req.body;
  if (!name || !display_name) return res.status(400).json({ error: 'name and display_name required' });
  const result = await db.query(
    'INSERT INTO data_sources (name, display_name, config) VALUES ($1,$2,$3) RETURNING *',
    [name, display_name, JSON.stringify(config || {})]
  );
  res.status(201).json({ data: result.rows[0] });
});

router.put('/:id', async (req: Request, res: Response) => {
  const { display_name, enabled, config } = req.body;
  const result = await db.query(
    `UPDATE data_sources SET
      display_name = COALESCE($2, display_name),
      enabled = COALESCE($3, enabled),
      config = COALESCE($4, config),
      updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [req.params.id, display_name, enabled, config ? JSON.stringify(config) : null]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: result.rows[0] });
});

router.delete('/:id', async (req: Request, res: Response) => {
  await db.query('DELETE FROM data_sources WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

export default router;
