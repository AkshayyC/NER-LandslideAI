import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { SystemStatusProvider } from './context/SystemStatusContext';
import { CommandCenter } from './pages/CommandCenter';
import { RiskMapPage } from './pages/RiskMapPage';
import { LocationAnalysis } from './pages/LocationAnalysis';
import { HistoricalAnalytics } from './pages/HistoricalAnalytics';
import { DistrictIntelligence } from './pages/DistrictIntelligence';
import { ModelInsights } from './pages/ModelInsights';
import { AlertsPage } from './pages/AlertsPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { NotFound } from './pages/NotFound';

export default function App() {
  return (
    <SystemStatusProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<CommandCenter />} />
          <Route path="map" element={<RiskMapPage />} />
          <Route path="location" element={<LocationAnalysis />} />
          <Route path="history" element={<HistoricalAnalytics />} />
          <Route path="districts" element={<DistrictIntelligence />} />
          <Route path="model" element={<ModelInsights />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="methodology" element={<MethodologyPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </SystemStatusProvider>
  );
}
