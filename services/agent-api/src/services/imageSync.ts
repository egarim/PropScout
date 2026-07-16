import { db } from '../db';
import * as Minio from 'minio';
import axios from 'axios';
import { createHash } from 'crypto';

const minio = new Minio.Client({
  endPoint: '127.0.0.1',
  port: 9010,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'propscout',
  secretKey: process.env.MINIO_SECRET_KEY || 'PropScoutMinio2026!',
});

const BUCKET = 'propscout-images';

export async function syncPropertyImages(propertyId: string, rawData: any): Promise<number> {
  const urls: { url: string; isPrimary: boolean }[] = [];

  // Cover image
  if (rawData.imgSrc) {
    urls.push({ url: rawData.imgSrc, isPrimary: true });
  }

  // Carousel photos (Zillow format)
  const carousel = rawData.carouselPhotosComposable;
  if (carousel?.baseUrl && carousel?.photoKeys?.length) {
    for (const key of carousel.photoKeys.slice(0, 9)) {
      const url = carousel.baseUrl.replace('{photoKey}', key);
      urls.push({ url, isPrimary: false });
    }
  }

  // Zillow photos array alternative (detail scrape) — jpeg variants are sorted
  // small→large, so take the last for full resolution
  const photos = rawData.photos || rawData.originalPhotos || rawData.responsivePhotos;
  if (photos?.length) {
    for (const p of photos.slice(0, 10)) {
      const jpeg = p.mixedSources?.jpeg;
      const url = (typeof p === 'string' ? p : null) || p.url || (jpeg && jpeg[jpeg.length - 1]?.url);
      if (url) urls.push({ url, isPrimary: false });
    }
  }

  if (!urls.length) return 0;

  // Dedupe and guarantee exactly one primary (cover queries rely on it)
  const seen = new Set<string>();
  const unique = urls.filter(u => !seen.has(u.url) && seen.add(u.url));
  if (!unique.some(u => u.isPrimary)) unique[0].isPrimary = true;
  urls.length = 0;
  urls.push(...unique.slice(0, 10));

  // Delete old images for this property
  await db.query('DELETE FROM property_images WHERE property_id = $1', [propertyId]);

  let saved = 0;
  for (const { url, isPrimary } of urls) {
    try {
      const minioKey = await downloadToMinio(url, propertyId);
      const publicUrl = `https://propscout.xari.net/img/${minioKey}`;
      await db.query(
        `INSERT INTO property_images (property_id, url, minio_key, is_primary)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [propertyId, publicUrl, minioKey, isPrimary]
      );
      saved++;
    } catch (err: any) {
      // Skip failed images silently
    }
  }
  return saved;
}

async function downloadToMinio(url: string, propertyId: string): Promise<string> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PropScout/1.0)',
      'Referer': 'https://www.zillow.com/',
    },
  });

  const contentType = response.headers['content-type'] || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  // md5 of the full URL — base64-prefix slicing collided (all Zillow photo
  // URLs share a prefix), overwriting every gallery photo with the last one
  const hash = createHash('md5').update(url).digest('hex').slice(0, 16);
  const key = `${propertyId}/${hash}.${ext}`;

  const buffer = Buffer.from(response.data);
  await minio.putObject(BUCKET, key, buffer, buffer.length, { 'Content-Type': contentType });
  return key;
}

export async function syncAllPropertyImages(concurrency = 5): Promise<{ total: number; synced: number; images: number }> {
  const result = await db.query(`
    SELECT p.id, p.raw_data
    FROM properties p
    LEFT JOIN property_images pi ON pi.property_id = p.id
    WHERE pi.id IS NULL AND p.raw_data IS NOT NULL
    ORDER BY p.created_at DESC
  `);

  const rows = result.rows;
  let synced = 0, totalImages = 0;

  // Process in batches
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(row => syncPropertyImages(row.id, row.raw_data))
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value > 0) {
        synced++;
        totalImages += r.value;
      }
    }
    // Small delay to avoid hammering Zillow CDN
    await new Promise(res => setTimeout(res, 200));
  }

  return { total: rows.length, synced, images: totalImages };
}
