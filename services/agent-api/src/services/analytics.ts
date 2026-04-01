import { db } from '../db';

// Claude Sonnet 4 pricing (per token)
const PRICE_IN  = 0.075  / 1_000_000; // $3 per 1M input tokens
const PRICE_OUT = 0.30 / 1_000_000; // $15 per 1M output tokens

interface QueryLog {
  userId: string;
  channel: string;
  query: string;
  response: string;
  tokensIn: number;
  tokensOut: number;
  toolCalls: any[];
}

export async function logQuery(data: QueryLog) {
  const cost = data.tokensIn * PRICE_IN + data.tokensOut * PRICE_OUT;

  // Extract intent + structured data from tool calls
  const intent   = extractIntent(data.toolCalls);
  const zips     = extractZips(data.toolCalls, data.query);
  const priceMin = extractParam(data.toolCalls, 'min_price');
  const priceMax = extractParam(data.toolCalls, 'max_price');
  const beds     = extractParam(data.toolCalls, 'beds');

  await db.query(
    `INSERT INTO agent_queries
       (user_id, channel, query, response, tokens_in, tokens_out, tokens_used, cost_usd,
        tool_calls, intent, zips_mentioned, price_min, price_max, beds_requested)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      data.userId, data.channel, data.query, data.response,
      data.tokensIn, data.tokensOut, data.tokensIn + data.tokensOut,
      cost.toFixed(6),
      JSON.stringify(data.toolCalls),
      intent,
      zips.length ? zips : null,
      priceMin || null,
      priceMax || null,
      beds || null,
    ]
  );
}

function extractIntent(toolCalls: any[]): string {
  const names = toolCalls.map(tc => tc.function?.name || tc.name).filter(Boolean);
  if (names.includes('search_properties')) return 'property_search';
  if (names.includes('zip_summary'))       return 'zip_comparison';
  if (names.includes('get_stats'))         return 'market_stats';
  return 'general';
}

function extractZips(toolCalls: any[], query: string): string[] {
  const zips = new Set<string>();
  // From tool args
  for (const tc of toolCalls) {
    const args = tc.function?.arguments || tc.arguments || {};
    const parsed = typeof args === 'string' ? JSON.parse(args || '{}') : args;
    if (parsed.zip) zips.add(parsed.zip);
  }
  // From raw query text
  const matches = query.match(/\b8[0-9]{4}\b/g) || [];
  matches.forEach(z => zips.add(z));
  return [...zips];
}

function extractParam(toolCalls: any[], param: string): number | null {
  for (const tc of toolCalls) {
    const args = tc.function?.arguments || tc.arguments || {};
    const parsed = typeof args === 'string' ? JSON.parse(args || '{}') : args;
    if (parsed[param] != null) return Number(parsed[param]);
  }
  return null;
}
