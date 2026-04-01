import { Router } from 'express';
import { testDb } from '../db';

const router = Router();

router.get('/', async (_req, res) => {
  const dbOk = await testDb();
  const status = dbOk ? 'ok' : 'degraded';
  res.status(dbOk ? 200 : 503).json({
    status,
    version: '0.1.0',
    services: { database: dbOk ? 'ok' : 'error' },
    timestamp: new Date().toISOString(),
  });
});

export default router;
