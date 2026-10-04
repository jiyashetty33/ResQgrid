import type { ReactNode } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';

export function PageTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{action && <div className="title-action">{action}</div>}</div>;
}

export function Panel({ title, detail, action, children, className = '' }: { title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>{children}</section>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="notice notice-error" role="alert"><AlertCircle size={17} /><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}>Retry</button>}</div>;
}

export function Loading({ label = 'Loading operational data' }: { label?: string }) {
  return <div className="loading"><LoaderCircle className="spin" size={19} />{label}</div>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-mark">—</span><strong>{title}</strong><p>{detail}</p></div>;
}

export function SeverityTag({ value }: { value: string }) {
  return <span className={`tag severity-${value.toLowerCase()}`}>{value}</span>;
}

export function StatusTag({ value }: { value: string }) {
  return <span className={`tag status-${value.toLowerCase().replaceAll('_', '-')}`}>{value.replaceAll('_', ' ')}</span>;
}

export function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}