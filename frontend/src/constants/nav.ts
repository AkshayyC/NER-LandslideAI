import {
  BellRing,
  BookOpen,
  BrainCircuit,
  Building2,
  Crosshair,
  History,
  LayoutDashboard,
  Map,
  Route,
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
    description: 'Regional state of the hazard, the season, and the current watchlist.',
  },
  {
    path: '/map',
    label: 'Hazard Map',
    short: 'Map',
    module: '02',
    icon: Map,
    description: 'Susceptibility, rainfall-triggered risk and uncertainty as switchable grid layers.',
  },
  {
    path: '/location',
    label: 'Location Analysis',
    short: 'Location',
    module: '03',
    icon: Crosshair,
    description: 'Full factor attribution and rainfall thresholds for any coordinate.',
  },
  {
    path: '/districts',
    label: 'Districts',
    short: 'Districts',
    module: '04',
    icon: Building2,
    description: 'District-level exposure, mean risk and record counts.',
  },
  {
    path: '/lifelines',
    label: 'Lifelines',
    short: 'Lifelines',
    module: '05',
    icon: Route,
    description: 'Road and rail corridors scored along their length, with isolation risk.',
  },
  {
    path: '/evidence',
    label: 'Evidence',
    short: 'Evidence',
    module: '06',
    icon: History,
    description: 'The reference catalogue of recorded events behind the historical factor.',
  },
  {
    path: '/watchlist',
    label: 'Watchlist',
    short: 'Watch',
    module: '07',
    icon: BellRing,
    description: 'Cells where rainfall is expected to raise risk the most, plus the briefing.',
  },
  {
    path: '/model',
    label: 'Model',
    short: 'Model',
    module: '08',
    icon: BrainCircuit,
    description: 'Weights, rescaling, uncertainty grades and data provenance.',
  },
  {
    path: '/methodology',
    label: 'Method',
    short: 'Method',
    module: '09',
    icon: BookOpen,
    description: 'How the index, the trigger ratio and the thresholds are defined.',
  },
];
