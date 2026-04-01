import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { TrendingUp, Users, DollarSign, MessageSquare } from 'lucide-react';

const getAnalytics = () => api.get('/analytics/overview').then(r => r.data);

function Stat({ icon: Icon, label, value, sub, color = 'sky' }: any) {
  const colors: any = { sky: 'text-sky-600 bg-sky-50', green: 'text-green-600 bg-green-50', purple: 'text-purple-600 bg-purple-50', amber: 'text-amber-600 bg-amber-50' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2 rounded-lg ${colors[color]}`}><Icon size={20} /></div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const INTENT_LABELS: any = {
  property_search: '🔍 Property Search',
  zip_comparison:  '📍 Zip Comparison',
  market_stats:    '📊 Market Stats',
  general:         '💬 General',
};

export default function Trends() {
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: getAnalytics, refetchInterval: 30000 });

  if (isLoading) return <div className="p-8 text-gray-400">Loading…</div>;

  const t = data?.totals || {};
  const totalCost  = parseFloat(t.total_cost || 0).toFixed(4);
  const avgCost    = parseFloat(t.avg_cost_per_query || 0).toFixed(5);
  const intents    = data?.intents || [];
  const topZips    = data?.top_zips || [];
  const topUsers   = data?.top_users || [];
  const priceRanges = data?.price_ranges || [];
  const daily      = data?.daily || [];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Trends & Usage</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat icon={MessageSquare} label="Total Queries"   value={Number(t.total_queries||0).toLocaleString()}  color="sky" />
        <Stat icon={Users}         label="Unique Users"    value={Number(t.unique_users||0).toLocaleString()}   color="purple" />
        <Stat icon={DollarSign}    label="Total AI Cost"   value={`$${totalCost}`} sub={`~$${avgCost} / query`} color="green" />
        <Stat icon={TrendingUp}    label="Total Tokens"    value={Number(t.total_tokens||0).toLocaleString()}   color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Top Searched Zips */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">📍 Most Searched Zip Codes</h3>
          {topZips.length === 0 ? <p className="text-gray-400 text-sm">No data yet.</p> : (
            <div className="space-y-2">
              {topZips.map((z: any) => (
                <div key={z.zip} className="flex items-center gap-3">
                  <span className="font-mono text-sm w-14 font-medium">{z.zip}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-sky-500 h-2 rounded-full" style={{ width: `${Math.min(100, z.searches / topZips[0].searches * 100)}%` }} />
                  </div>
                  <span className="text-sm text-gray-500 w-8 text-right">{z.searches}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Intent Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">🎯 Query Intent</h3>
          {intents.length === 0 ? <p className="text-gray-400 text-sm">No data yet.</p> : (
            <div className="space-y-2">
              {intents.map((i: any) => (
                <div key={i.intent} className="flex items-center gap-3">
                  <span className="text-sm w-40">{INTENT_LABELS[i.intent] || i.intent}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.min(100, i.count / intents[0].count * 100)}%` }} />
                  </div>
                  <span className="text-sm text-gray-500 w-8 text-right">{i.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price Range Interest */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">💰 Price Range Interest</h3>
          {priceRanges.length === 0 ? <p className="text-gray-400 text-sm">No data yet.</p> : (
            <div className="space-y-2">
              {priceRanges.map((r: any) => (
                <div key={r.range} className="flex items-center gap-3">
                  <span className="text-sm w-32">{r.range}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(100, r.searches / Math.max(...priceRanges.map((x:any)=>x.searches)) * 100)}%` }} />
                  </div>
                  <span className="text-sm text-gray-500 w-8 text-right">{r.searches}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Users */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">👤 Top Users by Cost</h3>
          {topUsers.length === 0 ? <p className="text-gray-400 text-sm">No data yet.</p> : (
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left pb-2">User</th>
                  <th className="text-left pb-2">Channel</th>
                  <th className="text-right pb-2">Queries</th>
                  <th className="text-right pb-2">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topUsers.slice(0,8).map((u: any) => (
                  <tr key={u.user_id}>
                    <td className="py-1.5 font-mono text-xs">{String(u.user_id).slice(0,10)}</td>
                    <td className="py-1.5 text-gray-500">{u.channel}</td>
                    <td className="py-1.5 text-right">{u.queries}</td>
                    <td className="py-1.5 text-right font-medium">${parseFloat(u.total_cost).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Daily activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold mb-4">📅 Daily Activity (last 14 days)</h3>
        {daily.length === 0 ? <p className="text-gray-400 text-sm">No data yet.</p> : (
          <table className="w-full text-sm">
            <thead className="text-gray-400 text-xs uppercase">
              <tr>
                <th className="text-left pb-2">Date</th>
                <th className="text-right pb-2">Queries</th>
                <th className="text-right pb-2">AI Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {daily.map((d: any) => (
                <tr key={d.day}>
                  <td className="py-1.5">{new Date(d.day).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</td>
                  <td className="py-1.5 text-right">{d.queries}</td>
                  <td className="py-1.5 text-right font-mono text-xs">${parseFloat(d.cost||0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
