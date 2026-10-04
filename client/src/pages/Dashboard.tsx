import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Boxes, ClipboardCheck, FileText, RefreshCw } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { api, messageOf } from '../services/api';
import type { ActivityLog, DashboardSummary, Incident, Resource } from '../types';
import { OperationsMap } from '../components/OperationsMap';
import { Empty, ErrorNotice, formatTime, Loading, PageTitle, Panel, SeverityTag, StatusTag } from '../components/Common';

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [nextSummary, nextIncidents, nextResources, nextActivity] = await Promise.all([
        api.get<DashboardSummary>('/api/dashboard/summary'), api.get<Incident[]>('/api/incidents'),
        api.get<Resource[]>('/api/resources'), api.get<ActivityLog[]>('/api/activity?limit=7'),
      ]);
      setSummary(nextSummary); setIncidents(nextIncidents); setResources(nextResources); setActivity(nextActivity);
    } catch (err) { setError(messageOf(err)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (busy && !summary) return <Loading />;
  const stats = summary?.stats;
  const chartData = Object.entries(summary?.severityCounts ?? {}).map(([name, count]) => ({ name, count }));
  const active = incidents.filter((item) => item.status !== 'resolved').slice(0, 5);

  return <div className="page-content">
    <PageTitle eyebrow="OPERATIONS / OVERVIEW" title="Command center" action={<button className="button button-quiet" onClick={() => void load()} aria-label="Refresh command center"><RefreshCw size={15} /> Refresh</button>} />
    {error && <ErrorNotice message={error} onRetry={() => void load()} />}
    {summary?.hasPendingReplan && <div className="notice notice-warning"><AlertTriangle size={17} /><span>Replanning requires coordinator review.</span><Link to="/dispatches">Review dispatches</Link></div>}
    <div className="stats-grid">
      <Stat label="Active incidents" value={stats?.activeIncidents} icon={<AlertTriangle />} tone="coral" foot={`${stats?.criticalCount ?? 0} critical`} />
      <Stat label="Available units" value={stats?.availableResources} icon={<Boxes />} tone="green" foot={`${resources.length} tracked resources`} />
      <Stat label="Awaiting approval" value={stats?.pendingApprovals} icon={<ClipboardCheck />} tone="gold" foot="Dispatch queue" />
      <Stat label="Reports received" value={stats?.totalReports} icon={<FileText />} tone="blue" foot="Ingestion pipeline" />
    </div>
    <div className="dashboard-grid">
      <Panel title="Incident map" detail="Live incident and resource positions" className="map-panel">
        {incidents.length || resources.length ? <OperationsMap incidents={incidents} resources={resources} /> : <Empty title="No mapped units" detail="Locations appear here as response data arrives." />}
      </Panel>
      <Panel title="Situation brief" detail="Generated from current incident and conflict data">
        <div className="brief-copy">{summary?.situationSummary || 'No situation brief is available yet.'}</div>
        <div className="brief-footer"><span className="signal-dot" />{summary?.conflicts?.length ? `${summary.conflicts.length} resource conflicts detected` : 'No active resource conflicts'}<Link to="/allocation" aria-label="Open allocation plan"><ArrowUpRight size={16} /></Link></div>
        {summary?.conflicts?.slice(0, 2).map((conflict, index) => <div className="conflict-line" key={`${conflict.resource_type}-${index}`}><strong>{conflict.resource_type.replaceAll('_', ' ')}</strong><span>{conflict.shortage} unit shortfall</span></div>)}
      </Panel>
      <Panel title="Active incidents" detail="Highest-priority response sites" action={<Link className="panel-link" to="/incidents">View all <ArrowUpRight size={14} /></Link>}>
        {active.length ? <div className="incident-list">{active.map((incident) => <Link className="incident-row" to="/incidents" key={incident.id}>
          <span className={`priority-indicator priority-${incident.severity.toLowerCase()}`} />
          <span className="incident-main"><strong>{incident.code} · {incident.name}</strong><small>{incident.location_name} · {incident.people_affected.toLocaleString()} people</small></span>
          <span className="incident-row-meta"><SeverityTag value={incident.severity} /><small>{incident.priority_score} pts</small></span>
        </Link>)}</div> : <Empty title="No active incidents" detail="New incidents will be listed here." />}
      </Panel>
      <Panel title="Severity distribution" detail="All tracked incidents" className="chart-panel">
        {chartData.some((item) => item.count) ? <ResponsiveContainer width="100%" height={190}><BarChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#e8e9e2" /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#707872', fontSize: 10 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#707872', fontSize: 10 }} /><Tooltip cursor={{ fill: '#f0f2ed' }} /><Bar dataKey="count" fill="#287a70" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart></ResponsiveContainer> : <Empty title="No severity data" detail="Incidents will populate this chart." />}
      </Panel>
      <Panel title="Recent activity" detail="Latest command center events" action={<Activity size={17} className="muted-icon" />}>
        {activity.length ? <div className="activity-list">{activity.map((item) => <div className="activity-row" key={item.id}><span className={`activity-marker activity-${item.level}`} /><div><p>{item.message}</p><small>{formatTime(item.created_at)} <span>·</span> {item.category}</small></div><StatusTag value={item.level} /></div>)}</div> : <Empty title="Activity is quiet" detail="System and response events will appear here." />}
      </Panel>
    </div>
    <div className="dashboard-footnote"><Activity size={14} /> Data refreshes when this view is opened. Use refresh to request the latest API state.</div>
  </div>;
}

function Stat({ label, value, icon, tone, foot }: { label: string; value?: number; icon: ReactNode; tone: string; foot: string }) {
  return <div className="stat-block"><div className={`stat-icon stat-${tone}`}>{icon}</div><div className="stat-label">{label}</div><strong className="stat-value">{value ?? '—'}</strong><div className="stat-foot">{foot}</div></div>;
}