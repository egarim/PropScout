import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { chat } from './ai';
import { getStats, getZipSummary, searchProperties, getRecentJobs } from './queries';
import axios from 'axios';

import { ensureAccess, isAdmin, setAccess, listUsers } from './access';
import { sendPriceDropAlerts, setAlerts } from './alerts';
import { tgFormat } from './format';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const API_URL = process.env.AGENT_API_URL || 'http://127.0.0.1:3100';

if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN required'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

import { pendingResults } from './state';

function fmt(n: any) {
  return n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A';
}

// ── /start ────────────────────────────────────────────────
bot.onText(/\/start/, async (msg) => {
  if (!(await ensureAccess(bot, msg))) return;
  bot.sendMessage(msg.chat.id,
    `🏠 *PropScout AI*\n\nWelcome! Ask me anything about Phoenix AZ real estate.\n\n` +
    `Try: _"Show me homes under $500k with 3 bedrooms"_\n\n` +
    `/help — all commands`,
    { parse_mode: 'Markdown' }
  );
});

// ── /help ─────────────────────────────────────────────────
bot.onText(/\/help/, async (msg) => {
  if (!(await ensureAccess(bot, msg))) return;
  bot.sendMessage(msg.chat.id,
    `🏠 *PropScout Commands*\n\n` +
    `*Data*\n` +
    `/stats — Market overview\n` +
    `/zips — Summary by zip code\n` +
    `/search <zip> [max price] — Find properties\n` +
    `📍 Share a location — nearest listings\n\n` +
    `*Scraping*\n` +
    `/jobs — Recent scrape jobs\n` +
    `/scrape <zip> [zip2...] — Trigger a scrape\n\n` +
    `*Other*\n` +
    `/alerts on|off — Price-drop alerts\n` +
    `/clear — Reset conversation\n\n` +
    `Or just ask naturally:\n` +
    `_"3-bed homes under $600k in 85254"_\n` +
    `_"Compare zip codes by price"_`,
    { parse_mode: 'Markdown' }
  );
});

// ── /stats ────────────────────────────────────────────────
bot.onText(/\/stats/, async (msg) => {
  if (!(await ensureAccess(bot, msg))) return;
  try {
    const s = await getStats();
    bot.sendMessage(msg.chat.id,
      `📊 *Phoenix Market Stats*\n\n` +
      `🏘 Total properties: *${Number(s.total).toLocaleString()}*\n` +
      `💰 Avg price: *${fmt(s.avg_price)}*\n` +
      `📉 Min price: *${fmt(s.min_price)}*\n` +
      `📈 Max price: *${fmt(s.max_price)}*\n` +
      `\n${Number(s.total) === 0 ? '⚠️ No data yet — run /scrape to populate.' : ''}`,
      { parse_mode: 'Markdown' }
    );
  } catch { bot.sendMessage(msg.chat.id, '❌ DB error.'); }
});

// ── /zips ─────────────────────────────────────────────────
bot.onText(/\/zips/, async (msg) => {
  if (!(await ensureAccess(bot, msg))) return;
  try {
    const zips = await getZipSummary();
    if (!zips.length) return bot.sendMessage(msg.chat.id, '⚠️ No data yet. Run /scrape first.');
    const lines = zips.map(z => `\`${z.zip_code}\` — ${z.count} listings · avg ${fmt(z.avg_price)}`).join('\n');
    bot.sendMessage(msg.chat.id, `📍 *Zip Code Summary*\n\n${lines}`, { parse_mode: 'Markdown' });
  } catch { bot.sendMessage(msg.chat.id, '❌ DB error.'); }
});

// ── /search ───────────────────────────────────────────────
bot.onText(/\/search (.+)/, async (msg, match) => {
  if (!(await ensureAccess(bot, msg))) return;
  const parts = match![1].trim().split(/\s+/);
  const zip = parts[0];
  const maxPrice = parts[1] ? parseInt(parts[1].replace(/[^0-9]/g, '')) : undefined;
  try {
    const props = await searchProperties({ zip, maxPrice, limit: 8 });
    if (!props.length) return bot.sendMessage(msg.chat.id, `No properties found for ${zip}${maxPrice ? ` under ${fmt(maxPrice)}` : ''}.`);
    sendNumberedList(msg.chat.id, props, `Results for ${zip}${maxPrice ? ` ≤ ${fmt(maxPrice)}` : ''}`);
  } catch { bot.sendMessage(msg.chat.id, '❌ Search error.'); }
});

// ── /jobs ─────────────────────────────────────────────────
bot.onText(/\/jobs/, async (msg) => {
  if (!isAdmin(msg.from?.id)) return;
  try {
    const jobs = await getRecentJobs();
    if (!jobs.length) return bot.sendMessage(msg.chat.id, 'No scrape jobs yet.');
    const lines = jobs.map(j => {
      const emoji = j.status === 'done' ? '✅' : j.status === 'running' ? '🔄' : '❌';
      return `${emoji} *${j.display_name || '?'}* [${(j.zip_codes || []).join(', ')}] — ${j.records_scraped ?? 0} records`;
    }).join('\n\n');
    bot.sendMessage(msg.chat.id, `📋 *Recent Jobs*\n\n${lines}`, { parse_mode: 'Markdown' });
  } catch { bot.sendMessage(msg.chat.id, '❌ Error.'); }
});

// ── /scrape ───────────────────────────────────────────────
bot.onText(/\/scrape(.*)/, async (msg, match) => {
  if (!isAdmin(msg.from?.id)) return bot.sendMessage(msg.chat.id, '⛔ Admin only.');
  const zips = match![1].trim().split(/\s+/).filter(Boolean);
  if (!zips.length) zips.push('85254');
  bot.sendMessage(msg.chat.id, `🔄 Launching scrape for ${zips.join(', ')}…`);
  try {
    const settingsRes = await axios.get(`${API_URL}/api/apify/settings`);
    const settings = settingsRes.data.data;
    if (!settings.length) return bot.sendMessage(msg.chat.id, '⚠️ No Apify config. Go to https://propscout.xari.net/settings');
    const runRes = await axios.post(`${API_URL}/api/apify/run`, { settings_id: settings[0].id, zip_codes: zips });
    const job = runRes.data.data;
    bot.sendMessage(msg.chat.id,
      `🚀 *Scrape launched!*\nZips: ${zips.join(', ')}\nRun: \`${job.apify_run_id}\`\n\nUse /jobs to check status.`,
      { parse_mode: 'Markdown' }
    );
  } catch (e: any) {
    bot.sendMessage(msg.chat.id, `❌ ${e.response?.data?.error || e.message}`);
  }
});

// ── /clear ────────────────────────────────────────────────
bot.onText(/\/clear/, async (msg) => {
  pendingResults.delete(msg.chat.id);
  await axios.post(`${API_URL}/api/agent/clear`, { chatId: msg.chat.id, channel: 'telegram' }).catch(() => {});
  bot.sendMessage(msg.chat.id, '🧹 Conversation cleared.');
});

// ── /alerts on|off ────────────────────────────────────────
bot.onText(/\/alerts(?:\s+(on|off))?/, async (msg, match) => {
  if (!(await ensureAccess(bot, msg))) return;
  const arg = match?.[1];
  if (!arg) return bot.sendMessage(msg.chat.id, '🔔 Usage: /alerts on — daily price-drop alerts · /alerts off — stop them');
  await setAlerts(String(msg.from?.id ?? msg.chat.id), arg === 'on');
  bot.sendMessage(msg.chat.id, arg === 'on'
    ? '🔔 Price-drop alerts ON — you\'ll get a digest when listings drop in price.'
    : '🔕 Price-drop alerts OFF.');
});

// ── /users (admin) ────────────────────────────────────────
bot.onText(/\/users/, async (msg) => {
  if (!isAdmin(msg.from?.id)) return;
  const users = await listUsers();
  if (!users.length) return bot.sendMessage(msg.chat.id, 'No users yet.');
  const icon: any = { approved: '✅', pending: '⏳', denied: '⛔', blocked: '🚫' };
  const lines = users.map(u =>
    `${icon[u.status] || '❓'} \`${u.identifier}\` — ${u.status}, ${u.query_count} queries, seen ${u.last_seen || 'never'}`);
  bot.sendMessage(msg.chat.id, `👥 *Users*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
});

// ── Approve/deny buttons ──────────────────────────────────
bot.on('callback_query', async (q) => {
  if (!isAdmin(q.from.id)) return bot.answerCallbackQuery(q.id, { text: 'Admins only' });
  const [action, uid] = (q.data || '').split(':');
  if (action !== 'approve' && action !== 'deny') return bot.answerCallbackQuery(q.id);

  await setAccess(uid, action === 'approve' ? 'approved' : 'denied', String(q.from.id));
  await bot.answerCallbackQuery(q.id, { text: action === 'approve' ? 'Approved' : 'Denied' });
  if (q.message) {
    await bot.editMessageText(
      `${action === 'approve' ? '✅ Approved' : '⛔ Denied'} — \`${uid}\``,
      { chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'Markdown' }
    ).catch(() => {});
  }
  if (action === 'approve') {
    bot.sendMessage(Number(uid),
      '✅ You\'re approved! Ask me anything about Phoenix real estate — try "3-bed homes under $600k in 85254".'
    ).catch(() => {});
  }
});

// ── Helper: send numbered list ────────────────────────────
function sendNumberedList(chatId: number, props: any[], title: string) {
  pendingResults.set(chatId, props);

  const lines = props.map((p, i) => {
    const price = fmt(p.current_price ?? p.new_price);
    const beds  = p.beds  || p.details?.beds  ? `${p.beds || p.details?.beds}bd` : '';
    const baths = p.baths || p.details?.baths ? `${p.baths || p.details?.baths}ba` : '';
    const addr  = (p.address || '').split(',')[0];
    // price-drop rows carry old_price — show the cut inline
    const drop = p.old_price != null ? `📉 ${fmt(p.old_price)} → ` : '';
    return `*${i + 1}.* ${addr}\n     ${drop}${price} · ${[beds, baths].filter(Boolean).join(' ')}`.replace(/ · $/, '');
  }).join('\n\n');

  bot.sendMessage(chatId,
    `🔍 *${title}*\n\n${lines}\n\n_Reply with a number (1–${props.length}) to see photos & full details._`,
    { parse_mode: 'Markdown' }
  );
}

// ── Helper: send single property detail ──────────────────
async function sendPropertyDetail(chatId: number, prop: any) {
  const price  = fmt(prop.current_price);
  const beds   = prop.beds  || prop.details?.beds;
  const baths  = prop.baths || prop.details?.baths;
  const sqft   = prop.sqft  || prop.details?.sqFt;
  const status = prop.status || prop.statusType || '';

  const base =
    `🏠 *${prop.address || 'N/A'}*\n` +
    `💰 *${price}*\n` +
    (beds   ? `🛏 ${beds} bedrooms\n`   : '') +
    (baths  ? `🚿 ${baths} bathrooms\n` : '') +
    (sqft   ? `📐 ${Number(sqft).toLocaleString()} sqft\n` : '') +
    (status ? `📋 ${status.replace(/_/g, ' ')}\n` : '') +
    `📍 ${prop.zip_code || ''}`;

  // Fetch images + market context (detail endpoint computes both)
  let images: string[] = [];
  let extra = '';
  try {
    const r = await axios.get(`${API_URL}/api/properties/${prop.id}`);
    const d2 = r.data.data || {};
    images = (d2.images || []).map((i: any) => i.url);
    const ctxLines: string[] = [];
    if (d2.price_per_sqft) {
      let line = `💲 ${fmt(d2.price_per_sqft)}/sqft`;
      if (d2.pct_vs_area != null) line += d2.pct_vs_area <= 0
        ? ` (*${Math.abs(d2.pct_vs_area)}% below* area median)`
        : ` (${d2.pct_vs_area}% above area median)`;
      ctxLines.push(line);
    }
    if (d2.days_on_market != null) ctxLines.push(`📅 ${d2.days_on_market} days on market`);
    if (Number(d2.price_cuts) > 0) ctxLines.push(`✂️ ${d2.price_cuts} price cut${d2.price_cuts > 1 ? 's' : ''} (−${fmt(d2.total_cut)})`);
    if (d2.tax_assessed) ctxLines.push(`🏷 Assessed: ${fmt(d2.tax_assessed)}`);
    if (d2.year_built) ctxLines.push(`🏗 Built ${d2.year_built}`);
    if (ctxLines.length) extra = '\n' + ctxLines.join('\n');
  } catch {}
  if (!images.length && prop.cover_image) images = [prop.cover_image];
  const caption = base + extra;

  if (images.length > 1) {
    const media = images.slice(0, 10).map((url, i) => ({
      type: 'photo' as const,
      media: url,
      ...(i === 0 ? { caption, parse_mode: 'Markdown' as const } : {}),
    }));
    await bot.sendMediaGroup(chatId, media).catch(async () => {
      await bot.sendPhoto(chatId, images[0], { caption, parse_mode: 'Markdown' }).catch(async () => {
        await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
      });
    });
  } else if (images.length === 1) {
    await bot.sendPhoto(chatId, images[0], { caption, parse_mode: 'Markdown' }).catch(async () => {
      await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    });
  } else {
    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
  }
}

// ── Shared location → nearest listings ───────────────────
bot.on('location', async (msg) => {
  if (!msg.location) return;
  if (!(await ensureAccess(bot, msg))) return;
  const { latitude, longitude } = msg.location;
  try {
    const r = await axios.get(`${API_URL}/api/properties/nearby`, {
      params: { lat: latitude, lng: longitude, radius_km: 15, limit: 8 },
    });
    const props = r.data.data || [];
    if (!props.length) return bot.sendMessage(msg.chat.id, '📍 No active listings within 15 km of that location.');
    const withDist = props.map((p: any) => ({ ...p, address: `${(p.address || '').split(',')[0]} · ${p.distance_km} km` }));
    sendNumberedList(msg.chat.id, withDist, 'Nearest listings');
  } catch {
    bot.sendMessage(msg.chat.id, '❌ Location search failed. Try again.');
  }
});

// ── Free text → AI or number picker ──────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!(await ensureAccess(bot, msg))) return;

  // Number picker
  const num = parseInt(msg.text.trim());
  const pending = pendingResults.get(msg.chat.id);
  if (!isNaN(num) && pending && num >= 1 && num <= pending.length) {
    await sendPropertyDetail(msg.chat.id, pending[num - 1]);
    return;
  }

  // AI query
  const typing = setInterval(() => bot.sendChatAction(msg.chat.id, 'typing').catch(() => {}), 4000);
  bot.sendChatAction(msg.chat.id, 'typing');

  try {
    const result = await chat(msg.chat.id, msg.text, msg.from?.id);
    clearInterval(typing);

    const pretty = tgFormat(result.reply);
    await bot.sendMessage(msg.chat.id, pretty, { parse_mode: 'Markdown' })
      .catch(() => bot.sendMessage(msg.chat.id, pretty)); // unbalanced markdown → plain text

    // If AI returned properties, show as numbered list
    if (result.properties && result.properties.length > 0) {
      sendNumberedList(msg.chat.id, result.properties, 'Results');
    }
  } catch {
    clearInterval(typing);
    bot.sendMessage(msg.chat.id, '❌ Error. Try again.');
  }
});

// Hourly price-drop digest (idempotent via property_history.alerted_at)
setInterval(() => sendPriceDropAlerts(bot).catch(err => console.error('Alerts error:', err.message)), 60 * 60 * 1000);

console.log('PropScout Telegram agent started ✅');
