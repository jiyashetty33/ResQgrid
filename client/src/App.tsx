import { useEffect, useState } from 'react';
import { Activity, BarChart3, Boxes, ClipboardList, FileText, LayoutDashboard, Menu, Radio, Settings, Siren, Truck, Waves, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BrowserRouter, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { api, messageOf } from './services/api';
import { AutomationPage, AllocationPage, AnalyticsPage, DispatchesPage, IncidentsPage, ReplanningPage, ReportsPage, ResourcesPage, SettingsPage, ActivityPage } from './pages/Operations';
import Dashboard from './pages/Dashboard';
import { ErrorNotice } from './components/Common';

type ServiceHealth = { status: string; data: string; ai: string; automation: string; time: string };
const navigation: Array<{ label: string; path: string; icon: LucideIcon; section: string }> = [
  { label: 'Command center', path: '/', icon: LayoutDashboard, section: 'OPERATIONS' },
  { label: 'Incidents', path: '/incidents', icon: Siren, section: 'OPERATIONS' },
  { label: 'Resources', path: '/resources', icon: Boxes, section: 'OPERATIONS' },
  { label: 'Allocation plan', path: '/allocation', icon: ClipboardList, section: 'COORDINATION' },
  { label: 'Replanning', path: '/replanning', icon: Waves, section: 'COORDINATION' },
  { label: 'Dispatch queue', path: '/dispatches', icon: Truck, section: 'COORDINATION' },
  { label: 'Reports', path: '/reports', icon: FileText, section: 'INTELLIGENCE' },
  { label: 'Activity', path: '/activity', icon: Activity, section: 'INTELLIGENCE' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, section: 'SYSTEM' },
  { label: 'Automation', path: '/automation', icon: Radio, section: 'SYSTEM' },
  { label: 'Settings', path: '/settings', icon: Settings, section: 'SYSTEM' },
];

export default function App() {
  return <BrowserRouter><Routes><Route element={<ApplicationShell />}>
    <Route index element={<Dashboard />} /><Route path="incidents" element={<IncidentsPage />} /><Route path="resources" element={<ResourcesPage />} />
    <Route path="allocation" element={<AllocationPage />} /><Route path="replanning" element={<ReplanningPage />} /><Route path="dispatches" element={<DispatchesPage />} />
    <Route path="reports" element={<ReportsPage />} /><Route path="activity" element={<ActivityPage />} /><Route path="analytics" element={<AnalyticsPage />} />
    <Route path="automation" element={<AutomationPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Dashboard />} />
  </Route></Routes></BrowserRouter>;
}

function ApplicationShell() {
  const [health, setHealth] = useState<ServiceHealth | null>(null); const [healthError, setHealthError] = useState(''); const [mobileOpen, setMobileOpen] = useState(false); const location = useLocation();
  useEffect(() => {
    let alive = true;
    const check = async () => { try { const result = await api.get<ServiceHealth>('/api/health'); if (alive) { setHealth(result); setHealthError(''); } } catch (error) { if (alive) { setHealth(null); setHealthError(messageOf(error)); } } };
    void check(); const timer = window.setInterval(() => void check(), 30000); return () => { alive = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  const activeTitle = navigation.find((item) => item.path === location.pathname)?.label ?? 'Command center';
  const sections = [...new Set(navigation.map((item) => item.section))];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><Waves size={22} strokeWidth={2.4} /></div><div><strong>ResQGrid</strong><span>RESPONSE NETWORK</span></div><button className="mobile-close icon-button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="mission-label"><span className="signal-dot" />MANGALURU REGION</div>
      <nav aria-label="Main navigation">{sections.map((section) => <div className="nav-section" key={section}><span className="nav-caption">{section}</span>{navigation.filter((item) => item.section === section).map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Dispatch queue' && health && <span className="nav-live-dot" />}</NavLink>)}</div>)}</nav>
      <div className="sidebar-footer"><div className="operator-avatar">DC</div><div><strong>Duty coordinator</strong><small>Operations desk 01</small></div><span className="online-dot" title="Local operator session" /></div>
    </aside>
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} />}
    <main className="main-column"><header className="topbar"><button className="mobile-menu icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={19} /></button><div className="breadcrumb"><span>RESQGRID</span><b>/</b><strong>{activeTitle}</strong></div><div className="topbar-right"><div className={`connection-pill ${health ? 'connected' : 'disconnected'}`} title={healthError || 'API connection status'}><span className="connection-dot" />{health ? 'API connected' : 'API unavailable'}</div>{health && <div className="mode-pills"><span>DATA <b>{health.data}</b></span><span>AI <b>{health.ai}</b></span><span>AUTO <b>{health.automation}</b></span></div>}<div className="topbar-time">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}<small>LOCAL</small></div></div></header>
      <div className="content-wrap">{healthError && <ErrorNotice message={`API connection unavailable: ${healthError}`} />}<Outlet /></div>
      <footer className="app-footer"><span>RESQGRID RESPONSE NETWORK</span><span>Human authorization required for critical dispatches</span><span>{health?.time ? `Server sync ${new Date(health.time).toLocaleTimeString()}` : 'Waiting for server'}</span></footer>
    </main>
  </div>;
}