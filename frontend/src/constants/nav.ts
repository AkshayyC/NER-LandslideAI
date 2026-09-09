import {
  BarChart3,
  BellRing,
  BookOpen,
  BrainCircuit,
  Crosshair,
  LayoutDashboard,
  Layers,
  Map,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  short: string;
  module: string;
  icon: LucideIcon;
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    label: 'Command Center',
    short: 'Command',
    module: '01',
    icon: LayoutDashboard,
    description: 'Region-wide overview, system status and historical statistics.',
  },
  {
    path: '/map',
    label: 'Risk Map',
    short: 'Map',
    module: '02',
    icon: Map,
    description: 'Interactive map of Northeast India with state and district selection.',
  },
  {
    path: '/location',
    label: 'Location Analysis',
    short: 'Location',
    module: '03',
    icon: Crosshair,
    description: 'Point susceptibility queries by latitude and longitude.',
  },
  {
    path: '/history',
    label: 'Historical Analytics',
    short: 'Historical',
    module: '04',
    icon: BarChart3,
    description: 'Historical landslide inventory statistics (backend data only).',
  },
  {
    path: '/districts',
    label: 'District Intelligence',
    short: 'Districts',
    module: '05',
    icon: Layers,
    description: 'State → district inventory and susceptibility coverage.',
  },
  {
    path: '/model',
    label: 'Model Insights',
    short: 'Model',
    module: '06',
    icon: BrainCircuit,
    description: 'Methodology, feature pipeline, validation and limitations.',
  },
  {
    path: '/alerts',
    label: 'Alerts',
    short: 'Alerts',
    module: '07',
    icon: BellRing,
    description: 'Interface for future rainfall-triggered warnings (integration pending).',
  },
  {
    path: '/methodology',
    label: 'Methodology',
    short: 'Method',
    module: '08',
    icon: BookOpen,
    description: 'From GSI inventory and environmental layers to risk intelligence.',
  },
];
