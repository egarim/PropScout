import { NavLink, Outlet } from 'react-router-dom';
import { Home, Settings, Play, Database, Bot, List, TrendingUp } from 'lucide-react';

const nav = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/properties', icon: Database, label: 'Properties' },
  { to: '/scrape', icon: Play, label: 'Run Scrape' },
  { to: '/runs', icon: List, label: 'Job History' },
  { to: '/settings', icon: Settings, label: 'Apify Settings' },
  { to: '/agent', icon: Bot, label: 'AI Agent' },
  { to: '/trends', icon: TrendingUp, label: 'Trends' },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white flex flex-col shrink-0">
        <div className="px-6 py-5 border-b border-gray-700">
          <h1 className="text-lg font-bold text-sky-400">🏠 PropScout</h1>
          <p className="text-xs text-gray-400 mt-0.5">Phoenix AZ Market</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-3">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-gray-700">
          <a
            href="/admin"
            target="_blank"
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Directus Admin →
          </a>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
