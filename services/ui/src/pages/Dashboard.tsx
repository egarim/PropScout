import { useQuery } from '@tanstack/react-query';
import { getRuns, getSources, getApifySettings } from '../api';

function Stat({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: runs = [] } = useQuery({ queryKey: ['runs'], queryFn: getRuns, refetchInterval: 10000 });
  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: getSources });
  const { data: settings = [] } = useQuery({ queryKey: ['apify-settings'], queryFn: getApifySettings });

  const running = runs.filter((r: any) => r.status === 'running').length;
  const done = runs.filter((r: any) => r.status === 'done').length;
  const totalRecords = runs.reduce((s: number, r: any) => s + (r.records_scraped || 0), 0);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Data Sources" value={sources.length} />
        <Stat label="Apify Configs" value={settings.length} />
        <Stat label="Running Jobs" value={running} />
        <Stat label="Properties Scraped" value={totalRecords.toLocaleString()} sub={`${done} completed runs`} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold">Recent Jobs</h3>
        </div>
        {runs.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400">
            No scrape jobs yet. Go to <strong>Run Scrape</strong> to start.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Source</th>
                <th className="px-6 py-3 text-left">Zip Codes</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Records</th>
                <th className="px-6 py-3 text-left">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.slice(0, 15).map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{r.source_name || '—'}</td>
                  <td className="px-6 py-3 text-gray-600">{(r.zip_codes || []).join(', ')}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'done' ? 'bg-green-100 text-green-700' :
                      r.status === 'running' ? 'bg-sky-100 text-sky-700' :
                      r.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {r.status === 'running' && <span className="animate-pulse">●</span>}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">{r.records_scraped ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">
                    {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
