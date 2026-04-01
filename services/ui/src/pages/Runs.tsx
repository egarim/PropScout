import { useQuery } from '@tanstack/react-query';
import { getRuns } from '../api';
import { RefreshCw } from 'lucide-react';

export default function Runs() {
  const { data: runs = [], refetch, isFetching } = useQuery({
    queryKey: ['runs'], queryFn: getRuns, refetchInterval: 15000
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Job History</h2>
        <button onClick={() => refetch()}
          className={`p-2 rounded-lg border border-gray-200 hover:bg-gray-100 ${isFetching ? 'animate-spin' : ''}`}>
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {runs.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">No jobs yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-6 py-3 text-left">Source</th>
                <th className="px-6 py-3 text-left">Zip Codes</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-right">Records</th>
                <th className="px-6 py-3 text-left">Started</th>
                <th className="px-6 py-3 text-left">Finished</th>
                <th className="px-6 py-3 text-left">Apify Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium">{r.source_name || '—'}</td>
                  <td className="px-6 py-3 text-gray-500">{(r.zip_codes || []).join(', ')}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'done' ? 'bg-green-100 text-green-700' :
                      r.status === 'running' ? 'bg-sky-100 text-sky-700' :
                      r.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'}`}>
                      {r.status === 'running' && <span className="animate-pulse text-sky-500">●</span>}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono">{r.records_scraped ?? '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                  <td className="px-6 py-3 text-gray-400 text-xs font-mono">{r.apify_run_id?.slice(0, 8) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
