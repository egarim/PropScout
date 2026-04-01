import { Router, Request, Response } from 'express';
import { ApifyClient } from 'apify-client';
import { db } from '../db';
import { z } from 'zod';

const router = Router();

// ── GET /apify/settings ────────────────────────────────────
router.get('/settings', async (_req: Request, res: Response) => {
  const result = await db.query(`
    SELECT s.*, d.name as source_name, d.display_name
    FROM apify_settings s
    JOIN data_sources d ON s.source_id = d.id
    ORDER BY d.name
  `);
  res.json({ data: result.rows });
});

// ── GET /apify/settings/:id ───────────────────────────────
router.get('/settings/:id', async (req: Request, res: Response) => {
  const result = await db.query(
    'SELECT * FROM apify_settings WHERE id = $1',
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: result.rows[0] });
});

// ── POST /apify/settings ─────────────────────────────────
const CreateSettingsSchema = z.object({
  source_id: z.string().uuid(),
  actor_id: z.string().min(1),
  api_token: z.string().optional(),
  max_items: z.number().int().min(1).max(10000).default(100),
  memory_mb: z.number().int().min(128).max(32768).default(512),
  input_template: z.record(z.any()).default({}),
});

router.post('/settings', async (req: Request, res: Response) => {
  const parsed = CreateSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { source_id, actor_id, api_token, max_items, memory_mb, input_template } = parsed.data;
  const result = await db.query(
    `INSERT INTO apify_settings (source_id, actor_id, api_token, max_items, memory_mb, input_template)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [source_id, actor_id, api_token || null, max_items, memory_mb, JSON.stringify(input_template)]
  );
  res.status(201).json({ data: result.rows[0] });
});

// ── PUT /apify/settings/:id ──────────────────────────────
router.put('/settings/:id', async (req: Request, res: Response) => {
  const parsed = CreateSettingsSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const fields = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

  const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const values = fields.map(([, v]) => typeof v === 'object' ? JSON.stringify(v) : v);

  const result = await db.query(
    `UPDATE apify_settings SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [req.params.id, ...values]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
  res.json({ data: result.rows[0] });
});

// ── DELETE /apify/settings/:id ───────────────────────────
router.delete('/settings/:id', async (req: Request, res: Response) => {
  await db.query('DELETE FROM apify_settings WHERE id = $1', [req.params.id]);
  res.status(204).send();
});

// ── POST /apify/test-connection ──────────────────────────
router.post('/test-connection', async (req: Request, res: Response) => {
  const { api_token, actor_id } = req.body;
  const token = api_token || process.env.APIFY_API_TOKEN;
  if (!token) return res.status(400).json({ error: 'No API token' });

  try {
    const client = new ApifyClient({ token });
    const actor = await client.actor(actor_id || 'apify/redfin-scraper').get();
    res.json({ ok: true, actor: actor?.name || actor_id });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ── POST /apify/run ──────────────────────────────────────
const RunSchema = z.object({
  settings_id: z.string().uuid(),
  zip_codes: z.array(z.string()).min(1),
  extra_input: z.record(z.any()).optional(),
});

router.post('/run', async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { settings_id, zip_codes, extra_input } = parsed.data;

  // Get settings
  const settingsResult = await db.query(
    'SELECT s.*, d.id as source_id FROM apify_settings s JOIN data_sources d ON s.source_id = d.id WHERE s.id = $1',
    [settings_id]
  );
  const settings = settingsResult.rows[0];
  if (!settings) return res.status(404).json({ error: 'Settings not found' });

  const token = settings.api_token || process.env.APIFY_API_TOKEN;
  const client = new ApifyClient({ token });

  // Build actor input
  const input = {
    ...settings.input_template,
    zipCodes: zip_codes,
    maxItems: settings.max_items,
    ...extra_input,
  };

  // Webhook URL
  const webhookUrl = `${process.env.PUBLIC_URL || 'https://propscout.xari.net'}/api/apify/webhook`;

  try {
    const run = await client.actor(settings.actor_id).start(input, {
      memory: settings.memory_mb,
      webhooks: [{
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
        requestUrl: webhookUrl,
        payloadTemplate: JSON.stringify({
          runId: '{{runId}}',
          status: '{{status}}',
          datasetId: '{{defaultDatasetId}}',
        }),
      }],
    });

    // Log job
    const job = await db.query(
      `INSERT INTO scrape_jobs (source_id, apify_run_id, status, zip_codes, started_at)
       VALUES ($1, $2, 'running', $3, NOW()) RETURNING *`,
      [settings.source_id, run.id, zip_codes]
    );

    res.status(202).json({ data: { job: job.rows[0], apify_run_id: run.id } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /apify/webhook ──────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  const { runId, status, datasetId } = req.body;

  if (!runId) return res.status(400).json({ error: 'Missing runId' });

  await db.query(
    `UPDATE scrape_jobs SET status = $1, finished_at = NOW()
     WHERE apify_run_id = $2`,
    [status === 'SUCCEEDED' ? 'done' : 'failed', runId]
  );

  if (status === 'SUCCEEDED' && datasetId) {
    // Queue data processing (async - don't block webhook response)
    processDataset(runId, datasetId).catch(console.error);
  }

  res.json({ ok: true });
});

// ── GET /apify/runs ──────────────────────────────────────
router.get('/runs', async (_req: Request, res: Response) => {
  const result = await db.query(`
    SELECT j.*, d.display_name as source_name
    FROM scrape_jobs j
    LEFT JOIN data_sources d ON j.source_id = d.id
    ORDER BY j.created_at DESC
    LIMIT 50
  `);
  res.json({ data: result.rows });
});

// ── Async dataset processor ──────────────────────────────
async function processDataset(runId: string, datasetId: string) {
  const token = process.env.APIFY_API_TOKEN!;
  const client = new ApifyClient({ token });

  const dataset = client.dataset(datasetId);
  const { items } = await dataset.listItems({ limit: 10000 });

  let count = 0;
  for (const item of items) {
    try {
      await upsertProperty(item);
      count++;
    } catch (err) {
      console.error('Error upserting property:', err);
    }
  }

  await db.query(
    'UPDATE scrape_jobs SET records_scraped = $1 WHERE apify_run_id = $2',
    [count, runId]
  );
  console.log(`Processed ${count} properties from run ${runId}`);
}

async function upsertProperty(item: any) {
  // Generic property upsert - handles any source format
  const address = item.address || item.streetAddress || item.fullStreetAddress || '';
  const price = item.price || item.listingPrice || item.soldPrice || null;
  const lat = item.latitude || item.lat || null;
  const lng = item.longitude || item.lng || null;

  const sourceResult = await db.query(
    "SELECT id FROM data_sources WHERE name = 'redfin' LIMIT 1"
  );
  const sourceId = sourceResult.rows[0]?.id;

  const externalId = item.url || item.mlsId || item.id || address;

  await db.query(
    `INSERT INTO properties
       (source_id, external_id, address, city, state, zip_code, location, status,
        property_type, current_price, details, raw_data, last_scraped_at)
     VALUES ($1,$2,$3,$4,$5,$6,
       CASE WHEN $7 IS NOT NULL AND $8 IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint($8,$7),4326) END,
       $9,$10,$11,$12,$13,NOW())
     ON CONFLICT (source_id, external_id) DO UPDATE SET
       current_price = EXCLUDED.current_price,
       status = EXCLUDED.status,
       details = EXCLUDED.details,
       raw_data = EXCLUDED.raw_data,
       last_scraped_at = NOW()`,
    [
      sourceId, externalId, address,
      item.city || null, item.state || null, item.zipCode || item.zip || null,
      lat, lng,
      item.status || item.listingStatus || null,
      item.propertyType || item.homeType || null,
      price,
      JSON.stringify({ beds: item.beds, baths: item.baths, sqFt: item.sqFt, ...item }),
      JSON.stringify(item),
    ]
  );
}

export default router;
