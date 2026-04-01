import TelegramBot from 'node-telegram-bot-api';
import 'dotenv/config';
import { chat } from './ai';
import { getStats, getZipSummary, searchProperties, getRecentJobs } from './queries';
import axios from 'axios';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(Number).filter(Boolean);
const API_URL = process.env.AGENT_API_URL || 'http://127.0.0.1:3100';

if (!TOKEN) { console.error('TELEGRAM_BOT_TOKEN required'); process.exit(1); }

const bot = new TelegramBot(TOKEN, { polling: true });

// Store last search results per chat so user can pick by number
const pendingResults = new Map<number, any[]>();

function isAdmin(id: number) {
  return ADMIN_IDS.length === 0 || ADMIN_IDS.includes(id);
}

function fmt(n: any) {
  return n != null ? `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A';
}

// ── /start ────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🏠 *PropScout AI*\n\nWelcome! Ask me anything about Phoenix AZ real estate.\n\n` +
    `Try: _"Show me homes under $500k with 3 bedrooms"_\n\n` +
    `/help — all commands`,
    { parse_mode: 'Markdown' }
  );
});

// ── /help ─────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `🏠 *PropScout Commands*\n\n` +
    `*Data*\n` +
    `/stats — Market overview\n` +
    `/zips — Summary by zip code\n` +
    `/search <zip> [max price] — Find properties\n\n` +
    `*Scraping*\n` +
    `/jobs — Recent scrape jobs\n` +
    `/scrape <zip> [zip2...] — Trigger a scrape\n\n` +
    `*Other*\n` +
    `/clear — Reset conversation\n\n` +
    `Or just ask naturally:\n` +
    `_"3-bed homes under $600k in 85254"_\n` +
    `_"Compare zip codes by price"_`,
    { parse_mode: 'Markdown' }
  );
});

// ── /stats ────────────────────────────────────────────────
bot.onText(/\/stats/, async (msg) => {
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
  try {
    const zips = await getZipSummary();
    if (!zips.length) return bot.sendMessage(msg.chat.id, '⚠️ No data yet. Run /scrape first.');
    const lines = zips.map(z => `\`${z.zip_code}\` — ${z.count} listings · avg ${fmt(z.avg_price)}`).join('\n');
    bot.sendMessage(msg.chat.id, `📍 *Zip Code Summary*\n\n${lines}`, { parse_mode: 'Markdown' });
  } catch { bot.sendMessage(msg.chat.id, '❌ DB error.'); }
});

// ── /search ───────────────────────────────────────────────
bot.onText(/\/search (.+)/, async (msg, match) => {
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
  if (!isAdmin(msg.from!.id)) return bot.sendMessage(msg.chat.id, '⛔ Admin only.');
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
bot.onText(/\/clear/, (msg) => {
  pendingResults.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, '🧹 Conversation cleared.');
});

// ── Helper: send numbered list ────────────────────────────
function sendNumberedList(chatId: number, props: any[], title: string) {
  pendingResults.set(chatId, props);

  const lines = props.map((p, i) => {
    const price = fmt(p.current_price);
    const beds  = p.beds  || p.details?.beds  ? `${p.beds || p.details?.beds}bd` : '';
    const baths = p.baths || p.details?.baths ? `${p.baths || p.details?.baths}ba` : '';
    const addr  = (p.address || '').split(',')[0];
    return `*${i + 1}.* ${addr}\n     ${price} · ${[beds, baths].filter(Boolean).join(' ')}`;
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

  const caption =
    `🏠 *${prop.address || 'N/A'}*\n` +
    `💰 *${price}*\n` +
    (beds   ? `🛏 ${beds} bedrooms\n`   : '') +
    (baths  ? `🚿 ${baths} bathrooms\n` : '') +
    (sqft   ? `📐 ${Number(sqft).toLocaleString()} sqft\n` : '') +
    (status ? `📋 ${status.replace(/_/g, ' ')}\n` : '') +
    `📍 ${prop.zip_code || ''}`;

  // Fetch cover image from DB if not on object
  let imageUrl = prop.cover_image;
  if (!imageUrl) {
    try {
      const r = await axios.get(`${API_URL}/api/properties/${prop.id}`);
      imageUrl = r.data.data?.images?.[0]?.url;
    } catch {}
  }

  if (imageUrl) {
    await bot.sendPhoto(chatId, imageUrl, { caption, parse_mode: 'Markdown' }).catch(async () => {
      await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
    });
  } else {
    await bot.sendMessage(chatId, caption, { parse_mode: 'Markdown' });
  }
}

// ── Free text → AI or number picker ──────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

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

    await bot.sendMessage(msg.chat.id, result.reply, { parse_mode: 'Markdown' });

    // If AI returned properties, show as numbered list
    if (result.properties && result.properties.length > 0) {
      sendNumberedList(msg.chat.id, result.properties, 'Results');
    }
  } catch {
    clearInterval(typing);
    bot.sendMessage(msg.chat.id, '❌ Error. Try again.');
  }
});

console.log('PropScout Telegram agent started ✅');
