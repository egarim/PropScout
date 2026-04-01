import { useState, useRef, useEffect } from 'react';
import { api } from '../api';
import { Send, Bot, Loader } from 'lucide-react';

interface Property {
  id: string; address: string; zip_code: string; current_price: number;
  status: string; beds: string; baths: string; sqft: string; cover_image: string;
}

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  ts: Date;
  properties?: Property[];
}

function PropertyMini({ p }: { p: Property }) {
  const FALLBACK = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="130" viewBox="0 0 200 130"><rect fill="%23f3f4f6" width="200" height="130"/><text x="50%25" y="50%25" fill="%239ca3af" text-anchor="middle" dy=".3em" font-size="12" font-family="sans-serif">No image</text></svg>';
  const price = p.current_price != null ? `$${Number(p.current_price).toLocaleString()}` : 'N/A';
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white w-48 shrink-0 shadow-sm">
      <img
        src={p.cover_image || FALLBACK}
        alt={p.address}
        className="w-full h-28 object-cover"
        onError={e => { (e.target as HTMLImageElement).src = FALLBACK; }}
      />
      <div className="p-2">
        <p className="font-bold text-sky-700 text-sm">{price}</p>
        <p className="text-xs text-gray-700 leading-tight mt-0.5 line-clamp-2">{p.address}</p>
        <p className="text-xs text-gray-400 mt-1">
          {[p.beds && `${p.beds}bd`, p.baths && `${p.baths}ba`, p.sqft && `${Number(p.sqft).toLocaleString()}sf`].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}

export default function Agent() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: "Hi! I'm PropScout AI 🏠\n\nAsk me anything about Phoenix real estate — prices, listings, zip comparisons. I search the live database.\n\nTry: *\"Show me 3-bed homes under $500k\"*", ts: new Date() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatId = useRef(Math.floor(Math.random() * 999999));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', text, ts: new Date() }]);
    setLoading(true);

    try {
      const r = await api.post('/agent/chat', { message: text, chatId: chatId.current });
      setMsgs(m => [...m, {
        role: 'assistant',
        text: r.data.reply,
        ts: new Date(),
        properties: r.data.properties?.length ? r.data.properties : undefined,
      }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', text: '❌ Error. Try again.', ts: new Date() }]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex items-center gap-3">
        <Bot size={20} className="text-sky-600" />
        <div>
          <h2 className="font-semibold">PropScout AI</h2>
          <p className="text-xs text-gray-500">Searches live property database</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {msgs.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-sky-600 text-white rounded-br-sm'
                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
            }`}>
              {m.text}
            </div>

            {/* Property image cards */}
            {m.properties && m.properties.length > 0 && (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2 max-w-full">
                {m.properties.map(p => <PropertyMini key={p.id} p={p} />)}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-sm">
              <Loader size={14} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-8 py-4 border-t border-gray-200 bg-white">
        <div className="flex gap-3 max-w-2xl mx-auto">
          <input
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Ask about Phoenix properties…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button onClick={send} disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
