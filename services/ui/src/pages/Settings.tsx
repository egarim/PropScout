import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApifySettings, getSources, createApifySettings, deleteApifySettings, testApifyConnection } from '../api';
import { Trash2, Plus, CheckCircle, XCircle, Loader } from 'lucide-react';

export default function Settings() {
  const qc = useQueryClient();
  const { data: settings = [] } = useQuery({ queryKey: ['apify-settings'], queryFn: getApifySettings });
  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: getSources });

  const [form, setForm] = useState({
    source_id: '',
    actor_id: 'redfin_com/redfin-scraper',
    api_token: '',
    max_items: 500,
    memory_mb: 512,
  });
  const [testResult, setTestResult] = useState<null | { ok: boolean; msg: string }>(null);
  const [testing, setTesting] = useState(false);

  const createMut = useMutation({
    mutationFn: createApifySettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['apify-settings'] }); setForm({ source_id: '', actor_id: 'redfin_com/redfin-scraper', api_token: '', max_items: 500, memory_mb: 512 }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteApifySettings,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apify-settings'] }),
  });

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await testApifyConnection({ actor_id: form.actor_id, api_token: form.api_token || undefined });
      setTestResult({ ok: r.ok, msg: r.ok ? `Connected — actor: ${r.actor}` : r.error });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    }
    setTesting(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.source_id) return;
    createMut.mutate({ ...form, api_token: form.api_token || undefined });
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Apify Settings</h2>

      {/* Add form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h3 className="font-semibold mb-4">Add Configuration</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Data Source *</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.source_id}
                onChange={e => setForm(f => ({ ...f, source_id: e.target.value }))}
                required
              >
                <option value="">Select source…</option>
                {sources.map((s: any) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Apify Actor ID *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.actor_id}
                onChange={e => setForm(f => ({ ...f, actor_id: e.target.value }))}
                placeholder="redfin_com/redfin-scraper"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">API Token (leave blank to use default)</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              value={form.api_token}
              onChange={e => setForm(f => ({ ...f, api_token: e.target.value }))}
              placeholder="apify_api_…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Max Items</label>
              <input type="number" min={1} max={10000}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.max_items}
                onChange={e => setForm(f => ({ ...f, max_items: +e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory (MB)</label>
              <input type="number" min={128} max={32768} step={128}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={form.memory_mb}
                onChange={e => setForm(f => ({ ...f, memory_mb: +e.target.value }))}
              />
            </div>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult.msg}
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={handleTest} disabled={testing}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              {testing ? <Loader size={14} className="animate-spin" /> : null}
              Test Connection
            </button>
            <button type="submit" disabled={createMut.isPending}
              className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700 flex items-center gap-2">
              <Plus size={14} />
              Save Configuration
            </button>
          </div>
        </form>
      </div>

      {/* Existing settings */}
      <div className="space-y-3">
        {settings.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No configurations yet.</p>
        ) : settings.map((s: any) => (
          <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{s.display_name || s.source_name}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">{s.actor_id}</p>
              <p className="text-xs text-gray-400">max {s.max_items} items · {s.memory_mb}MB</p>
            </div>
            <button onClick={() => deleteMut.mutate(s.id)}
              className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
