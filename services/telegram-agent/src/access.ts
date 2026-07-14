import { db } from './db';
import type TelegramBot from 'node-telegram-bot-api';

const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(Number).filter(Boolean);

export function isAdmin(id?: number) {
  return id != null && ADMIN_IDS.includes(id);
}

// Gate every interaction: admins pass, approved users pass (and count),
// new users get registered as pending + admins get approve/deny buttons.
export async function ensureAccess(bot: TelegramBot, msg: TelegramBot.Message): Promise<boolean> {
  const uid = msg.from?.id ?? msg.chat.id;
  if (isAdmin(uid)) return true;
  if (!ADMIN_IDS.length) return true; // ponytail: no admins configured = open bot (dev mode)

  const r = await db.query(
    // xmax = 0 → the row was just inserted (first contact)
    `INSERT INTO contact_channels (channel, identifier, status)
     VALUES ('telegram', $1, 'pending')
     ON CONFLICT (channel, identifier) DO UPDATE SET last_seen = NOW()
     RETURNING status, (xmax = 0) AS is_new`,
    [String(uid)]
  );
  const { status, is_new } = r.rows[0];

  if (status === 'approved') {
    db.query(
      `UPDATE contact_channels SET query_count = query_count + 1, last_seen = NOW()
       WHERE channel = 'telegram' AND identifier = $1`,
      [String(uid)]
    ).catch(() => {});
    return true;
  }

  if (is_new) {
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ')
      || msg.from?.username || String(uid);
    await bot.sendMessage(msg.chat.id,
      '🔒 PropScout is invite-only. Your access request has been sent to the admins — you\'ll get a message here once approved.');
    for (const admin of ADMIN_IDS) {
      await bot.sendMessage(admin,
        `🔔 Access request from *${name}*${msg.from?.username ? ` (@${msg.from.username})` : ''} — id \`${uid}\``,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `approve:${uid}` },
              { text: '⛔ Deny', callback_data: `deny:${uid}` },
            ]],
          },
        }).catch(() => {});
    }
  } else if (status === 'pending') {
    await bot.sendMessage(msg.chat.id, '⏳ Your access request is still pending approval.');
  }
  // denied/blocked: stay silent
  return false;
}

export async function setAccess(uid: string, status: 'approved' | 'denied', by: string) {
  await db.query(
    `UPDATE contact_channels
     SET status = $2,
         approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
         approved_by = $3
     WHERE channel = 'telegram' AND identifier = $1`,
    [uid, status, by]
  );
}

export async function listUsers() {
  const r = await db.query(
    `SELECT identifier, status, query_count, last_seen::date AS last_seen
     FROM contact_channels WHERE channel = 'telegram' ORDER BY last_seen DESC NULLS LAST LIMIT 30`
  );
  return r.rows;
}
