import { Router, Request, Response } from 'express';
import { db } from '../db';

const router = Router();

// GET /api/analytics/overview
router.get('/overview', async (_req: Request, res: Response) => {
  const [totals, daily, intents, topZips, topUsers, priceRanges] = await Promise.all([
    // Overall totals
    db.query(`
      SELECT
        COUNT(*)                          AS total_queries,
        COUNT(DISTINCT user_id)           AS unique_users,
        SUM(cost_usd)                     AS total_cost,
        AVG(cost_usd)                     AS avg_cost_per_query,
        SUM(tokens_in + tokens_out)       AS total_tokens
      FROM agent_queries
    `),
    // Queries per day (last 14 days)
    db.query(`
      SELECT DATE(created_at) AS day, COUNT(*) AS queries, SUM(cost_usd) AS cost
      FROM agent_queries
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY day ORDER BY day DESC
    `),
    // Intent breakdown
    db.query(`
      SELECT intent, COUNT(*) AS count
      FROM agent_queries
      WHERE intent IS NOT NULL
      GROUP BY intent ORDER BY count DESC
    `),
    // Most searched zip codes
    db.query(`
      SELECT unnest(zips_mentioned) AS zip, COUNT(*) AS searches
      FROM agent_queries
      WHERE zips_mentioned IS NOT NULL
      GROUP BY zip ORDER BY searches DESC LIMIT 10
    `),
    // Top users by cost
    db.query(`
      SELECT user_id, channel,
        COUNT(*) AS queries,
        SUM(cost_usd) AS total_cost,
        MAX(created_at) AS last_seen
      FROM agent_queries
      GROUP BY user_id, channel
      ORDER BY total_cost DESC LIMIT 20
    `),
    // Price range distribution
    db.query(`
      SELECT
        CASE
          WHEN price_max <= 300000  THEN 'Under $300k'
          WHEN price_max <= 500000  THEN '$300k–$500k'
          WHEN price_max <= 750000  THEN '$500k–$750k'
          WHEN price_max <= 1000000 THEN '$750k–$1M'
          ELSE 'Over $1M'
        END AS range,
        COUNT(*) AS searches
      FROM agent_queries
      WHERE price_max IS NOT NULL
      GROUP BY range ORDER BY MIN(price_max)
    `),
  ]);

  res.json({
    totals: totals.rows[0],
    daily: daily.rows,
    intents: intents.rows,
    top_zips: topZips.rows,
    top_users: topUsers.rows,
    price_ranges: priceRanges.rows,
  });
});

// GET /api/analytics/queries — recent raw queries
router.get('/queries', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string || '50'), 200);
  const r = await db.query(`
    SELECT id, user_id, channel, query, intent, zips_mentioned,
           price_min, price_max, beds_requested, cost_usd, tokens_in, tokens_out, created_at
    FROM agent_queries
    ORDER BY created_at DESC LIMIT $1
  `, [limit]);
  res.json({ data: r.rows });
});

export default router;
