import { Router, Request, Response } from 'express';
import { db } from '../db';
import axios from 'axios';
import { logQuery } from '../services/analytics';

const router = Router();

// ── DB query tools the AI can call ──────────────────────
// All tools exclude 'inactive' — listings that stopped appearing in scrapes
async function tool_get_stats() {
  const r = await db.query(`
    SELECT COUNT(*) as total,
      ROUND(AVG(current_price)) as avg_price,
      MIN(current_price) as min_price,
      MAX(current_price) as max_price
    FROM properties WHERE current_price IS NOT NULL AND status IS DISTINCT FROM 'inactive'
  `);
  return r.rows[0];
}

async function tool_search_properties(zip?: string, min_price?: number, max_price?: number, beds?: number, limit = 5) {
  const conds: string[] = [];
  const vals: any[] = [];
  let i = 1;
  if (zip)       { conds.push(`p.zip_code = $${i++}`); vals.push(zip); }
  if (min_price) { conds.push(`p.current_price >= $${i++}`); vals.push(min_price); }
  if (max_price) { conds.push(`p.current_price <= $${i++}`); vals.push(max_price); }
  if (beds)      { conds.push(`(p.details->>'beds')::numeric >= $${i++}`); vals.push(beds); }
  conds.push(`p.current_price IS NOT NULL`, `p.status IS DISTINCT FROM 'inactive'`);
  const where = `WHERE ${conds.join(' AND ')}`;
  const r = await db.query(
    `SELECT p.id, p.address, p.zip_code, p.current_price, p.status, p.property_type,
            p.details->>'beds' as beds, p.details->>'baths' as baths, p.details->>'sqFt' as sqft,
            (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
            pi.url AS cover_image
     FROM properties p
     LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
     ${where} ORDER BY p.current_price ASC LIMIT ${Math.min(limit,10)}`,
    vals
  );
  return r.rows;
}

async function tool_zip_summary(zip?: string) {
  const alive = `current_price IS NOT NULL AND status IS DISTINCT FROM 'inactive'`;
  const where = zip ? `WHERE zip_code = '${zip.replace(/'/g,"''")}' AND ${alive}` : `WHERE ${alive}`;
  const r = await db.query(`
    SELECT zip_code, COUNT(*) as count,
      ROUND(AVG(current_price)) as avg_price,
      MIN(current_price) as min_price,
      MAX(current_price) as max_price
    FROM properties ${where}
    GROUP BY zip_code ORDER BY count DESC LIMIT 15
  `);
  return r.rows;
}

async function tool_price_changes(days = 7, zip?: string, event = 'price_drop') {
  const vals: any[] = [Math.min(days, 90)];
  let zipCond = '';
  if (zip) { zipCond = 'AND p.zip_code = $2'; vals.push(zip); }
  const r = await db.query(
    `SELECT p.id, p.address, p.zip_code, h.old_price, h.price AS new_price,
            h.old_price - h.price AS drop_amount, h.time::date AS changed_on,
            (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
            pi.url AS cover_image
     FROM property_history h
     JOIN properties p ON p.id = h.property_id
     LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
     WHERE h.event = $${vals.push(event)} AND h.time > NOW() - make_interval(days => $1)
       AND p.status IS DISTINCT FROM 'inactive' ${zipCond}
     ORDER BY ABS(h.old_price - h.price) DESC LIMIT 15`,
    vals
  );
  return r.rows;
}

async function tool_nearby_properties(lat: number, lng: number, radius_km = 10, limit = 8) {
  const r = await db.query(
    `SELECT * FROM (
       SELECT p.id, p.address, p.zip_code, p.current_price,
              p.details->>'beds' AS beds, p.details->>'baths' AS baths,
              (p.raw_data->'hdpData'->'homeInfo'->>'daysOnZillow')::int AS days_on_market,
              pi.url AS cover_image,
              ROUND((6371 * acos(LEAST(1,
                cos(radians($1)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians($2))
                + sin(radians($1)) * sin(radians(p.lat)))))::numeric, 1) AS distance_km
       FROM properties p
       LEFT JOIN property_images pi ON pi.property_id = p.id AND pi.is_primary = true
       WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
         AND p.current_price IS NOT NULL AND p.status IS DISTINCT FROM 'inactive'
     ) t
     WHERE distance_km <= $3
     ORDER BY distance_km ASC LIMIT $4`,
    [lat, lng, Math.min(radius_km, 100), Math.min(limit, 10)]
  );
  return r.rows;
}

// Tool definitions for OpenRouter function calling
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: 'Get overall market stats: total properties, avg/min/max price',
      parameters: { type: 'object', properties: {} },
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description: 'Search properties by zip code, price range, and/or minimum bedrooms. Returns matching listings.',
      parameters: {
        type: 'object',
        properties: {
          zip:       { type: 'string',  description: '5-digit zip code e.g. 85254' },
          min_price: { type: 'number',  description: 'Minimum price in USD' },
          max_price: { type: 'number',  description: 'Maximum price in USD' },
          beds:      { type: 'number',  description: 'Minimum number of bedrooms' },
          limit:     { type: 'number',  description: 'Max results to return (default 5, max 10)' },
        },
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'nearby_properties',
      description: 'Find listings closest to a coordinate, nearest first with distance_km. Use when the user names a place or landmark — geocode it to lat/lng yourself (Phoenix metro area).',
      parameters: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat:       { type: 'number', description: 'Latitude' },
          lng:       { type: 'number', description: 'Longitude' },
          radius_km: { type: 'number', description: 'Search radius in km (default 10, max 100)' },
          limit:     { type: 'number', description: 'Max results (default 8, max 10)' },
        },
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'price_changes',
      description: 'List recent price drops (or increases) with old vs new price. Use for "what dropped in price", "price cuts", "reductions".',
      parameters: {
        type: 'object',
        properties: {
          days:  { type: 'number', description: 'Look-back window in days (default 7, max 90)' },
          zip:   { type: 'string', description: 'Optional zip code filter' },
          event: { type: 'string', enum: ['price_drop', 'price_increase'], description: 'Default price_drop' },
        },
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'zip_summary',
      description: 'Get price summary (count, avg, min, max) for each zip code, or for a specific zip.',
      parameters: {
        type: 'object',
        properties: {
          zip: { type: 'string', description: 'Optional specific zip code to filter' },
        }
      }
    }
  },
];

async function callTool(name: string, args: any): Promise<string> {
  try {
    if (name === 'get_stats') {
      const r = await tool_get_stats();
      return JSON.stringify(r);
    }
    if (name === 'search_properties') {
      const r = await tool_search_properties(args.zip, args.min_price, args.max_price, args.beds, args.limit);
      return JSON.stringify(r);
    }
    if (name === 'zip_summary') {
      const r = await tool_zip_summary(args.zip);
      return JSON.stringify(r);
    }
    if (name === 'price_changes') {
      const r = await tool_price_changes(args.days, args.zip, args.event);
      return JSON.stringify(r);
    }
    if (name === 'nearby_properties') {
      const r = await tool_nearby_properties(args.lat, args.lng, args.radius_km, args.limit);
      return JSON.stringify(r);
    }
    return JSON.stringify({ error: 'Unknown tool' });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

const SYSTEM = `You are PropScout AI 🏠, a real estate data assistant for the Phoenix AZ market.
You have access to a live database of scraped property listings.
ALWAYS use the provided tools to answer questions — never guess prices or invent data.
Format prices with $ and commas. Keep answers concise.
Respond in the same language the user writes in (English or Spanish).`;

// Channel-specific output style appended to the system prompt
const CHANNEL_STYLE: Record<string, string> = {
  telegram: `
FORMATTING — you are writing inside a Telegram chat bubble. Telegram renders NO tables, NO headers, NO horizontal rules; they show up as raw ugly text.
- NEVER output markdown tables, # headers, or --- rules.
- Bold with *single asterisks*, and only for prices and key numbers.
- List properties as short numbered blocks, one property per block:
1. 📍 *7009 E Acoma Dr #2102* — *$488,900*
   🛏 3 bd · 🚿 2 ba · 📐 1,264 sqft · Apartment
- Maximum ~8 lines of prose besides the listing blocks. End with one short follow-up question.
- If you listed properties, remind: reply with a number to see photos.`,
  web: `
FORMATTING — the web chat renders GitHub-flavored markdown. Tables are fine for comparisons; keep them small.`,
};

interface Message { role: string; content: string; tool_call_id?: string; name?: string; tool_calls?: any[] }

// Conversation memory: in-process cache over agent_sessions (survives restarts).
// Keyed per channel+chat — Telegram DMs are per-user; web is per-browser session.
const history = new Map<string, Message[]>();

async function loadHistory(key: string): Promise<Message[]> {
  const cached = history.get(key);
  if (cached) return cached;
  const r = await db.query('SELECT messages FROM agent_sessions WHERE session_key = $1', [key]);
  return r.rows[0]?.messages || [];
}

function saveHistory(key: string, msgs: Message[]) {
  history.set(key, msgs);
  db.query(
    `INSERT INTO agent_sessions (session_key, messages) VALUES ($1, $2)
     ON CONFLICT (session_key) DO UPDATE SET messages = $2, updated_at = NOW()`,
    [key, JSON.stringify(msgs)]
  ).catch(err => console.error('Session save error:', err.message));
}

// LLM endpoint — defaults to the fleet LiteLLM gateway (mesh); swap model/provider via env
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://100.64.0.4:4000/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-v4-flash';
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY;

async function llmChat(messages: Message[], withToolChoice = false, channel = 'web') {
  const system = SYSTEM + (CHANNEL_STYLE[channel] || CHANNEL_STYLE.web);
  return axios.post(`${LLM_BASE_URL}/chat/completions`, {
    model: LLM_MODEL,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: TOOLS,
    ...(withToolChoice ? { tool_choice: 'auto' } : {}),
    max_tokens: 800,
  }, {
    headers: { 'Authorization': `Bearer ${LLM_API_KEY}`, 'HTTP-Referer': 'https://propscout.xari.net', 'X-Title': 'PropScout' },
    timeout: 60000,
  });
}

router.post('/clear', async (req: Request, res: Response) => {
  const key = `${req.body.channel || 'web'}:${req.body.chatId || 0}`;
  history.delete(key);
  await db.query('DELETE FROM agent_sessions WHERE session_key = $1', [key]);
  res.json({ ok: true });
});

router.post('/chat', async (req: Request, res: Response) => {
  const { message, chatId, userId, channel = 'web' } = req.body;
  const sessionKey = `${channel}:${chatId || 0}`;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (!LLM_API_KEY) return res.json({ reply: '⚠️ AI not configured. Add LLM_API_KEY.' });

  const msgs: Message[] = await loadHistory(sessionKey);
  msgs.push({ role: 'user', content: message });

  const recent = msgs.slice(-12);

  try {
    let response = await llmChat(recent, true, channel);

    let assistantMsg = response.data.choices[0].message;

    // Handle tool calls loop
    while (assistantMsg.tool_calls?.length) {
      recent.push(assistantMsg);

      const toolResults: Message[] = [];
      for (const tc of assistantMsg.tool_calls) {
        // LLM occasionally emits malformed JSON args — feed the error back as
        // a tool result so it can retry, instead of 500ing the whole chat
        let args: any = {};
        let parseError: string | null = null;
        try { args = JSON.parse(tc.function.arguments || '{}'); }
        catch (e: any) { parseError = e.message; }
        const result = parseError
          ? JSON.stringify({ error: `Invalid JSON arguments: ${parseError}. Retry the tool call with valid JSON.` })
          : await callTool(tc.function.name, args);
        toolResults.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: result });
      }
      recent.push(...toolResults);

      response = await llmChat(recent, false, channel);
      assistantMsg = response.data.choices[0].message;
    }

    const reply = assistantMsg.content || '';
    msgs.push({ role: 'assistant', content: reply });
    saveHistory(sessionKey, msgs.slice(-20));

    // Collect any property results from tool calls for rich rendering
    const properties: any[] = [];
    for (const m of recent) {
      if (m.role === 'tool' && ['search_properties', 'nearby_properties', 'price_changes'].includes(m.name || '')) {
        try {
          const items = JSON.parse(m.content || '[]');
          if (Array.isArray(items)) properties.push(...items.filter((p: any) => p.cover_image));
        } catch {}
      }
    }

    // Log query with cost + intent (non-blocking)
    const usage = response.data.usage || {};
    const allToolCalls = recent
      .filter(m => m.tool_calls?.length)
      .flatMap(m => m.tool_calls || []);
    logQuery({
      userId: String(userId || chatId || 'anonymous'),
      channel,
      query: message,
      response: reply,
      tokensIn: usage.prompt_tokens || 0,
      tokensOut: usage.completion_tokens || 0,
      toolCalls: allToolCalls,
    }).catch(err => console.error('Analytics log error:', err.message));

    res.json({ reply, properties: properties.slice(0, 10) });

  } catch (err: any) {
    console.error('AI error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
