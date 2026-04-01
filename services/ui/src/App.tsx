import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Properties from './pages/Properties';
import Settings from './pages/Settings';
import RunScrape from './pages/RunScrape';
import Runs from './pages/Runs';
import Agent from './pages/Agent';
import Trends from './pages/Trends';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="properties" element={<Properties />} />
            <Route path="scrape" element={<RunScrape />} />
            <Route path="runs" element={<Runs />} />
            <Route path="settings" element={<Settings />} />
            <Route path="agent" element={<Agent />} />
            <Route path="trends" element={<Trends />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
