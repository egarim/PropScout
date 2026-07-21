import { db } from '../db';
import { ApifyClient } from 'apify-client';
import { syncPropertyImages } from './imageSync';

const DETAIL_ACTOR = process.env.DETAIL_ACTOR_ID || 'maxcopell/zillow-detail-scraper';
// ponytail: daily cap to bound Apify cost; raise via env if the backlog matters
const DETAIL_LIMIT = Number(process.env.DETAIL_SCRAPE_LIMIT || 150);

// Kick a gallery scrape for recently-scraped properties that only have a cover image.
export async function startDetailScrape(): Promise<string | null> {
  const r = await db.query(
    `SELECT p.id, p.raw_data->>'detailUrl' AS detail_url
     FROM properties p
     WHERE p.raw_data->>'detailUrl' IS NOT NULL
       AND p.last_scraped_at > NOW() - INTERVAL '2 days'
       AND (SELECT count(*) FROM property_images pi WHERE pi.property_id = p.id) < 2
     ORDER BY p.last_scraped_at DESC
     LIMIT $1`,
    [DETAIL_LIMIT]
  );
  if (!r.rows.length) { console.log('Detail scrape: nothing to do'); return null; }

  const startUrls = r.rows.map(row => ({
    url: row.detail_url.startsWith('http') ? row.detail_url : `https://www.zillow.com${row.detail_url}`,
  }));

  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
  const webhookUrl = `${process.env.PUBLIC_URL || 'https://propscout.xari.net'}/api/apify/webhook`;
  const run = await client.actor(DETAIL_ACTOR).start(
    { startUrls, propertyStatus: 'FOR_SALE' },
    {
      webhooks: [{
        eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
        requestUrl: webhookUrl,
        // whole-object variable only — dotted paths don't render (see apify.ts)
        payloadTemplate: '{"resource": {{resource}}, "kind": "detail"}',
      }],
    }
  );
  console.log(`Detail scrape started: ${run.id} for ${startUrls.length} properties`);
  return run.id;
}

// Webhook side: match detail items to properties by zpid and sync their galleries.
export async function processDetailDataset(datasetId: string) {
  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN! });
  const { items } = await client.dataset(datasetId).listItems({ limit: 10000 });

  let synced = 0, images = 0;
  for (const item of items as any[]) {
    if (!item.zpid) continue;
    const r = await db.query('SELECT id FROM properties WHERE external_id = $1', [String(item.zpid)]);
    const propertyId = r.rows[0]?.id;
    if (!propertyId) continue;
    try {
      // persist photos (re-sync without re-scraping) + descriptive extras
      const photos = item.photos || item.originalPhotos || item.responsivePhotos;
      const extras: Record<string, any> = {};
      if (photos?.length) extras.photos = photos.slice(0, 10);
      if (item.description) extras.description = String(item.description).slice(0, 2000);
      if (item.yearBuilt) extras.yearBuilt = item.yearBuilt;
      if (Object.keys(extras).length) {
        await db.query(
          `UPDATE properties SET raw_data = raw_data || $2::jsonb WHERE id = $1`,
          [propertyId, JSON.stringify(extras)]
        );
      }
      const n = await syncPropertyImages(propertyId, item);
      if (n > 0) { synced++; images += n; }
    } catch (err: any) {
      console.error('Detail gallery sync error:', item.zpid, err.message);
    }
  }
  console.log(`Detail gallery sync: ${images} images for ${synced} properties`);
}
