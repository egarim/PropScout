import { db } from './db';
import type TelegramBot from 'node-telegram-bot-api';

const fmt = (n: any) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// Hourly sweep: digest un-alerted price drops to subscribers, then mark them.
// Idempotent — safe no matter how often the ingest chain runs.
export async function sendPriceDropAlerts(bot: TelegramBot) {
  const drops = await db.query(
    `SELECT h.time, h.old_price, h.price, p.address, p.zip_code, p.id AS property_id,
            pi.url AS cover_image
     FROM property_history h
     JOIN properties p ON p.id = h.property_id
     LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
     WHERE h.event = 'price_drop' AND h.alerted_at IS NULL
       AND p.status IS DISTINCT FROM 'inactive'
     ORDER BY h.old_price - h.price DESC`
  );
  if (!drops.rows.length) return;

  const subs = await db.query(
    `SELECT identifier FROM contact_channels
     WHERE channel = 'telegram' AND alerts_enabled AND status = 'approved'`
  );

  if (subs.rows.length) {
    const top = drops.rows.slice(0, 10);
    const lines = top.map(d => {
      const pct = d.old_price ? Math.round((1 - d.price / d.old_price) * 100) : 0;
      return `📉 *${(d.address || '').split(',')[0]}* (${d.zip_code})\n     ${fmt(d.old_price)} → *${fmt(d.price)}* (−${pct}%)`;
    }).join('\n\n');
    const extra = drops.rows.length > top.length ? `\n\n…and ${drops.rows.length - top.length} more. Ask me "price drops this week".` : '';
    const text = `🔔 *Price drops in Phoenix*\n\n${lines}${extra}`;

    // Cover photos of the dropped listings as an album, one short caption each
    const media = top.filter(d => d.cover_image).slice(0, 10).map(d => {
      const pct = d.old_price ? Math.round((1 - d.price / d.old_price) * 100) : 0;
      return {
        type: 'photo' as const,
        media: d.cover_image,
        caption: `${(d.address || '').split(',')[0]} — ${fmt(d.price)} (−${pct}%)`,
      };
    });

    for (const s of subs.rows) {
      const chat = Number(s.identifier);
      await bot.sendMessage(chat, text, { parse_mode: 'Markdown' }).catch(() => {});
      if (media.length) await bot.sendMediaGroup(chat, media).catch(() => {});
    }
    console.log(`Alerts: ${drops.rows.length} drops sent to ${subs.rows.length} subscribers`);
  }

  // Mark handled even with zero subscribers, so old drops don't pile up
  await db.query(`UPDATE property_history SET alerted_at = NOW() WHERE event = 'price_drop' AND alerted_at IS NULL`);
}

export async function setAlerts(uid: string, enabled: boolean): Promise<boolean> {
  const r = await db.query(
    `UPDATE contact_channels SET alerts_enabled = $2
     WHERE channel = 'telegram' AND identifier = $1 RETURNING 1`,
    [uid, enabled]
  );
  if (r.rowCount) return true;
  // Admins bypass ensureAccess and may have no row yet — create one approved
  await db.query(
    `INSERT INTO contact_channels (channel, identifier, status, alerts_enabled, approved_at, approved_by)
     VALUES ('telegram', $1, 'approved', $2, NOW(), 'self')
     ON CONFLICT (channel, identifier) DO UPDATE SET alerts_enabled = $2`,
    [uid, enabled]
  );
  return true;
}
