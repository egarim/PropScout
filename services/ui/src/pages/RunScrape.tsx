import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApifySettings, triggerRun } from '../api';
import { Play, Loader, CheckCircle } from 'lucide-react';

const PRESET_ZIPS = ['85254', '85251', '85257', '85016', '85018', '85028', '85032', '85044', '85048', '85050'];

export default function RunScrape() {
  const qc = useQueryClient();
  const { data: settings = [] } = useQuery({ queryKey: ['apify-settings'], queryFn: getApifySettings });
  const [settingsId, setSettingsId] = useState('');
  const [zipInput, setZipInput] = useState('85254');
  const [selectedZips, setSelectedZips] = useState<string[]>(['85254']);
  const [launched, setLaunched] = useState<any>(null);

  const runMut = useMutation({
    mutationFn: triggerRun,
    onSuccess: (data) => {
      setLaunched(data);
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const toggleZip = (zip: string) => {
    setSelectedZips(prev => prev.includes(zip) ? prev.filter(z => z !== zip) : [...prev, zip]);
  };

  const addCustomZip = () => {
    const z = zipInput.trim();
    if (z && !selectedZips.includes(z)) setSelectedZips(prev => [...prev, z]);
    setZipInput('');
  };

  const handleRun = () => {
    if (!settingsId || selectedZips.length === 0) return;
    setLaunched(null);
    runMut.mutate({ settings_id: settingsId, zip_codes: selectedZips });
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Run Scrape</h2>

      {settings.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-sm text-yellow-800">
          No Apify configurations yet. Go to <strong>Apify Settings</strong> to add one first.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
          {/* Config select */}
          <div>
            <label className="block text-sm font-medium mb-2">Apify Configuration *</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={settingsId}
              onChange={e => setSettingsId(e.target.value)}
            >
              <option value="">Select configuration…</option>
              {settings.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.source_name} — {s.actor_id} (max {s.max_items})
                </option>
              ))}
            </select>
          </div>

          {/* Zip presets */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Zip Codes <span className="text-gray-400 font-normal">({selectedZips.length} selected)</span>
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_ZIPS.map(zip => (
                <button key={zip} onClick={() => toggleZip(zip)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    selectedZips.includes(zip)
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-sky-400'
                  }`}>
                  {zip}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Add custom zip code…"
                value={zipInput}
                onChange={e => setZipInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomZip()}
              />
              <button onClick={addCustomZip}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                Add
              </button>
            </div>
            {selectedZips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {selectedZips.map(z => (
                  <span key={z} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-700 rounded text-xs">
                    {z}
                    <button onClick={() => toggleZip(z)} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Launch */}
          {launched && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-green-50 text-green-700">
              <CheckCircle size={16} />
              Job launched! Apify run ID: <code className="font-mono text-xs">{launched.apify_run_id}</code>
            </div>
          )}
          {runMut.isError && (
            <div className="text-sm p-3 rounded-lg bg-red-50 text-red-700">
              Error: {(runMut.error as any)?.response?.data?.error || 'Unknown error'}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={!settingsId || selectedZips.length === 0 || runMut.isPending}
            className="w-full py-3 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {runMut.isPending ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {runMut.isPending ? 'Launching…' : `Launch Scrape (${selectedZips.length} zips)`}
          </button>
        </div>
      )}
    </div>
  );
}
