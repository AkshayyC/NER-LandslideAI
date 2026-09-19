import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SystemStatusProvider } from './context/SystemStatusContext';
import { CommandCenter } from './pages/CommandCenter';
import { HazardMap } from './pages/HazardMap';
import { LocationAnalysis } from './pages/LocationAnalysis';
import { DistrictIntelligence } from './pages/DistrictIntelligence';
import { Lifelines } from './pages/Lifelines';
import { Evidence } from './pages/Evidence';
import { Watchlist } from './pages/Watchlist';
import { ModelInsights } from './pages/ModelInsights';
import { MethodologyPage } from './pages/MethodologyPage';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <SystemStatusProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CommandCenter />} />
          <Route path="map" element={<HazardMap />} />
          <Route path="location" element={<LocationAnalysis />} />
          <Route path="districts" element={<DistrictIntelligence />} />
          <Route path="districts/:state/:district" element={<DistrictIntelligence />} />
          <Route path="lifelines" element={<Lifelines />} />
          <Route path="evidence" element={<Evidence />} />
          <Route path="watchlist" element={<Watchlist />} />
          <Route path="model" element={<ModelInsights />} />
          <Route path="methodology" element={<MethodologyPage />} />
          {/* Former module names kept alive as redirects so old links resolve. */}
          <Route path="history" element={<Navigate to="/evidence" replace />} />
          <Route path="alerts" element={<Navigate to="/watchlist" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SystemStatusProvider>
  );
}
