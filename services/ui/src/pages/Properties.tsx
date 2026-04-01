import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProperties } from '../api';
import { Search, Home, MapPin, DollarSign } from 'lucide-react';

const FALLBACK = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect fill="%23f3f4f6" width="320" height="200"/><text x="50%25" y="50%25" fill="%239ca3af" text-anchor="middle" dy=".3em" font-size="14" font-family="sans-serif">No image</text></svg>';

function PropertyCard({ p }: { p: any }) {
  const d = p.details || {};
  const price = p.current_price != null
    ? `$${Number(p.current_price).toLocaleString()}`
    : 'Price N/A';

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative h-48 bg-gray-100">
        <img
          src={p.cover_image || FALLBACK}
          alt={p.address || 'Property'}
          className="w-full h-full object-cover"
          onError={e => { (e.target as HTMLImageElement).src = FALLBACK; }}
        />
        {p.status && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-sky-600 text-white text-xs rounded-full font-medium">
            {p.status.replace(/_/g,' ')}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xl font-bold text-sky-700">{price}</p>
        <p className="text-sm text-gray-800 mt-1 font-medium leading-snug">{p.address || '—'}</p>
        <div className="flex items-center gap-1 mt-1">
          <MapPin size={12} className="text-gray-400" />
          <p className="text-xs text-gray-400">{[p.city, p.state, p.zip_code].filter(Boolean).join(', ')}</p>
        </div>
        <div className="flex gap-3 mt-3 text-sm text-gray-600">
          {d.beds   != null && <span>🛏 {d.beds} bd</span>}
          {d.baths  != null && <span>🚿 {d.baths} ba</span>}
          {d.sqFt   != null && <span>📐 {Number(d.sqFt).toLocaleString()} sf</span>}
        </div>
        {p.property_type && (
          <p className="text-xs text-gray-400 mt-2">{p.property_type}</p>
        )}
      </div>
    </div>
  );
}

export default function Properties() {
  const [search, setSearch]     = useState('');
  const [zip, setZip]           = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [page, setPage]         = useState(0);
  const limit = 24;

  const params = {
    search:    search   || undefined,
    zip:       zip      || undefined,
    min_price: minPrice || undefined,
    max_price: maxPrice || undefined,
    limit,
    offset: page * limit,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['properties', params],
    queryFn:  () => getProperties(params),
  });

  const props = data?.data || [];
  const total = data?.total || 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          Properties{' '}
          <span className="text-gray-400 text-lg font-normal">({total.toLocaleString()})</span>
        </h2>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Search address…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <input className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          placeholder="Zip" value={zip}
          onChange={e => { setZip(e.target.value); setPage(0); }} />
        <div className="relative">
          <DollarSign size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-36 pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Min price" type="number" value={minPrice}
            onChange={e => { setMinPrice(e.target.value); setPage(0); }} />
        </div>
        <div className="relative">
          <DollarSign size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-36 pl-6 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Max price" type="number" value={maxPrice}
            onChange={e => { setMaxPrice(e.target.value); setPage(0); }} />
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400">Loading…</div>
      ) : props.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <Home size={40} className="mx-auto mb-3 opacity-30" />
          <p>No properties found. Run a scrape to populate data.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {props.map((p: any) => <PropertyCard key={p.id} p={p} />)}
          </div>

          {/* Pagination */}
          <div className="mt-8 flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                ← Prev
              </button>
              <button disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
