import { Router, Request, Response } from 'express';
import { syncAllPropertyImages } from '../services/imageSync';

const router = Router();

// POST /api/images/sync — trigger full image sync
router.post('/sync', async (_req: Request, res: Response) => {
  // Respond immediately, run in background
  res.json({ ok: true, message: 'Image sync started in background' });
  syncAllPropertyImages(5).then(result => {
    console.log(`Image sync complete: ${result.synced}/${result.total} properties, ${result.images} images`);
  }).catch(err => {
    console.error('Image sync error:', err.message);
  });
});

// GET /api/images/status — how many properties have images
router.get('/status', async (_req: Request, res: Response) => {
  const { db } = await import('../db');
  const r = await db.query(`
    SELECT
      COUNT(DISTINCT p.id) as total_properties,
      COUNT(DISTINCT pi.property_id) as with_images,
      COUNT(pi.id) as total_images
    FROM properties p
    LEFT JOIN property_images pi ON pi.property_id = p.id
  `);
  res.json({ data: r.rows[0] });
});

export default router;
