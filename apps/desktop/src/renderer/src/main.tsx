import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { HashRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowLeft, ArrowUpRight, ChevronRight, CircleHelp, ExternalLink, LayoutDashboard, List, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CaseDetail, CaseEvent, CaseRow, Payment, Proof } from './api';
import { api } from './api';
import './i18n';
import './style.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });

function short(value: string, start = 8, end = 5) {
  return value.length > start + end + 1 ? `${value.slice(0, start)}…${value.slice(-end)}` : value;
}

function money(amount: string | null | undefined, currency: string | null | undefined) {
  if (!amount) return '—';
  return currency === 'USD' ? `$${amount}` : `${amount} ${currency ?? ''}`.trim();
}

function useDate() {
  const { i18n } = useTranslation();
  return (date: string) => new Intl.DateTimeFormat(i18n.language === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

function value(payload: Record<string, unknown>, key: string): string | null {
  const item = payload[key];
  return typeof item === 'string' ? item : null;
}

function list(payload: Record<string, unknown>, key: string): string[] {
  const item = payload[key];
  return Array.isArray(item) ? item.filter((entry): entry is string => typeof entry === 'string') : [];
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <span className={`status-inline status-${status.toLowerCase()}`}>{t(`statuses.${status}`, { defaultValue: status.replaceAll('_', ' ') })}</span>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const { t } = useTranslation();
  return <span className={`status-inline status-${verdict.toLowerCase()}`}>{t(`verdicts.${verdict}`, { defaultValue: verdict })}</span>;
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  return <div className="app-shell">
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label={t('dashboard')}>
        <span className="brand-mark">FB</span>
        <span><strong>{t('product')}</strong><small>{t('console')}</small></span>
      </Link>
      <nav aria-label={t('workspace')}>
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><LayoutDashboard size={17} />{t('dashboard')}</NavLink>
        <NavLink to="/cases" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}><List size={17} />{t('cases')}</NavLink>
      </nav>
      <div className="sidebar-bottom">
        <div className="language-switch" role="group" aria-label={t('language')}>
          <button type="button" className={i18n.language === 'en' ? 'selected' : ''} onClick={() => void i18n.changeLanguage('en')}>EN</button>
          <button type="button" className={i18n.language === 'ko' ? 'selected' : ''} onClick={() => void i18n.changeLanguage('ko')}>KO</button>
        </div>
      </div>
    </aside>
    <div className="main-area"><div className="topbar"><span>{t('console')}</span><span className="topbar-right">GWDC 2026</span></div><main>{children}</main></div>
  </div>;
}

function RequestState({ loading, error, retry, children }: { loading: boolean; error: boolean; retry: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (loading) return <div className="state-panel"><Activity size={20} />{t('loading')}</div>;
  if (error) return <div className="state-panel error-state"><CircleHelp size={21} /><p>{t('apiError')}</p><button type="button" onClick={retry}>{t('retry')}</button></div>;
  return <>{children}</>;
}

function CaseTable({ rows }: { rows: CaseRow[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const date = useDate();
  if (!rows.length) return <div className="empty-panel">{t('noCases')}</div>;
  return <div className="table-scroll"><table className="data-table"><thead><tr>
    <th>{t('caseId')}</th><th>{t('title')}</th><th>{t('agent')}</th><th>{t('amount')}</th><th>{t('status')}</th><th>{t('createdAt')}</th><th aria-label={t('openCase')} />
  </tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="case-row" role="link" tabIndex={0}
    onClick={() => navigate(`/cases/${row.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/cases/${row.id}`); }}>
    <td className="mono case-id">{short(row.id, 8, 5)}</td>
    <td><div className="row-title">{row.title}{row.hasProof && <span className="subtle-proof"><ShieldCheck size={12} />{t('onChain')}</span>}</div></td>
    <td className="muted">{row.agentName ?? (row.hasAgentDecision ? t('externalAgent') : t('unassigned'))}</td>
    <td className="mono amount-cell">{money(row.amount, row.currency)}</td>
    <td><StatusBadge status={row.status} /></td><td className="muted nowrap">{date(row.createdAt)}</td><td><ChevronRight size={16} className="row-chevron" /></td>
  </tr>)}</tbody></table></div>;
}

function Dashboard() {
  const { t } = useTranslation();
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  const usage = useQuery({ queryKey: ['usage'], queryFn: api.usage });
  const rows = cases.data ?? [];
  const summary = [
    { label: t('totalCases'), value: rows.length },
    { label: t('verified'), value: rows.filter((row) => row.status === 'VERIFIED').length },
    { label: t('blocked'), value: rows.filter((row) => row.status === 'BLOCKED').length },
    { label: t('disputed'), value: rows.filter((row) => row.status === 'DISPUTED').length },
  ];
  return <AppShell>
    <div className="page-heading dashboard-heading"><div><h1>{t('dashboard')}</h1><p>{t('dashboardIntro')}</p></div></div>
    <RequestState loading={cases.isPending} error={cases.isError} retry={() => void cases.refetch()}>
      <div className="metrics-grid" aria-label={t('dashboard')}>
        {summary.map((item) => <div key={item.label} className="metric"><span>{item.label}</span><strong>{item.value}</strong></div>)}
      </div>
      <section className="table-section dashboard-table"><div className="section-heading"><div><h2>{t('recentCases')}</h2><p>{t('casesIntro')}</p></div><Link to="/cases" className="text-link">{t('viewAll')} <ArrowUpRight size={15} /></Link></div><CaseTable rows={rows.slice(0, 8)} /></section>
    </RequestState>
    <section className="usage-section"><div className="section-heading"><div><h2>{t('tokenUsage')}</h2><p>Qwen3-32B</p></div></div>
      {usage.isPending ? <div className="small-state">{t('loading')}</div> : usage.isError ? <div className="small-state">{t('apiError')}</div> : <div className="usage-grid">
        <UsageItem label={t('policyExtraction')} count={usage.data.policyExtraction.totalTokens} calls={usage.data.policyExtraction.callCount} />
        <UsageItem label={t('auditExplanation')} count={usage.data.auditExplanation.totalTokens} calls={usage.data.auditExplanation.callCount} />
        <UsageItem label={t('totalTokens')} count={usage.data.total.totalTokens} calls={usage.data.total.callCount} strong />
      </div>}
    </section>
  </AppShell>;
}

function UsageItem({ label, count, calls, strong = false }: { label: string; count: number; calls: number; strong?: boolean }) {
  const { t } = useTranslation();
  return <div className={`usage-item${strong ? ' usage-total' : ''}`}><span>{label}</span><strong>{count.toLocaleString()}</strong><small>{t('calls', { count: calls })}</small></div>;
}

function Cases() {
  const { t } = useTranslation();
  const cases = useQuery({ queryKey: ['cases'], queryFn: api.cases });
  return <AppShell><div className="page-heading"><div><h1>{t('cases')}</h1><p>{t('casesIntro')}</p></div>{cases.data && <span className="page-count">{cases.data.length}</span>}</div>
    <RequestState loading={cases.isPending} error={cases.isError} retry={() => void cases.refetch()}><section className="table-section"><CaseTable rows={cases.data ?? []} /></section></RequestState>
  </AppShell>;
}

const eventNames: Record<string, string> = {
  USER_INSTRUCTION: 'instruction', POLICY_PARSED: 'policyParsed', AGENT_DECISION: 'agentDecision', POLICY_CHECK: 'policyCheck',
  HUMAN_APPROVAL: 'humanApproval', PAYMENT_EXECUTED: 'paymentExecuted', PAYMENT_BLOCKED: 'paymentBlocked',
  DISPUTE_CREATED: 'disputeCreated', PROOF_RECORDED: 'proofRecorded', AUDIT_RESULT: 'auditResult',
};

function EventBody({ event }: { event: CaseEvent }) {
  const { t } = useTranslation();
  const p = event.payload;
  if (event.eventType === 'USER_INSTRUCTION') return <p className="event-quote">“{value(p, 'text')}”</p>;
  if (event.eventType === 'POLICY_PARSED') {
    const policy = p.policy && typeof p.policy === 'object' && !Array.isArray(p.policy) ? p.policy as Record<string, unknown> : {};
    return <div className="event-lines"><span>{t('maxAmount')}: <strong>{money(value(policy, 'maxAmount'), value(policy, 'currency'))}</strong></span><span>{t('allowedMerchants')}: <strong>{list(policy, 'allowedMerchants').join(', ') || '—'}</strong></span></div>;
  }
  if (event.eventType === 'AGENT_DECISION') {
    const item = p.item && typeof p.item === 'object' && !Array.isArray(p.item) ? p.item as Record<string, unknown> : {};
    return <div className="event-lines"><span><strong>{value(item, 'name') ?? value(p, 'merchant')}</strong> · {value(p, 'merchant')}</span><span>{money(value(p, 'subtotal'), value(p, 'currency'))} + {money(value(p, 'estimatedFee'), value(p, 'currency'))} {t('fee').toLowerCase()} · {t('estimatedTotal')}: <strong>{money(value(p, 'estimatedTotal'), value(p, 'currency'))}</strong></span></div>;
  }
  if (event.eventType === 'POLICY_CHECK') {
    const checks = Array.isArray(p.checks) ? p.checks as Record<string, unknown>[] : [];
    return <div className="event-lines"><div className="inline-result"><span className={`result-word ${value(p, 'result') === 'BLOCK' ? 'danger-text' : 'success-text'}`}>{t(`decisions.${value(p, 'result')}`)}</span>{list(p, 'reasonCodes').map((code) => <span key={code} className="reason-tag">{t(`reasons.${code}`, { defaultValue: code.replaceAll('_', ' ') })}</span>)}</div><div className="checks-list">{checks.map((check, index) => <span key={`${check.rule}-${index}`}><b className={check.result === 'FAIL' ? 'danger-text' : 'success-text'}>{t(check.result === 'FAIL' ? 'fail' : 'pass')}</b> {t(`rules.${check.rule}`, { defaultValue: String(check.rule) })} · {String(check.actual ?? '')} / {String(check.expected ?? '')}</span>)}</div></div>;
  }
  if (event.eventType === 'HUMAN_APPROVAL') return <div className="event-lines"><span className="result-word">{t(`decisions.${value(p, 'decision')}`)}</span><span>{money(value(p, 'approvedAmount'), value(p, 'currency'))}</span></div>;
  if (event.eventType === 'PAYMENT_EXECUTED') return <div className="event-lines"><span><strong>{money(value(p, 'totalAmount'), value(p, 'currency'))}</strong> · {value(p, 'merchant')}</span><span>{t(`paymentStatuses.${value(p, 'status')}`, { defaultValue: value(p, 'status') ?? '—' })}</span></div>;
  if (event.eventType === 'PAYMENT_BLOCKED') return <div className="event-lines"><span><strong>{money(value(p, 'attemptedAmount'), value(p, 'currency'))}</strong></span><span>{list(p, 'reasonCodes').map((code) => t(`reasons.${code}`, { defaultValue: code.replaceAll('_', ' ') })).join(', ')}</span></div>;
  if (event.eventType === 'DISPUTE_CREATED') return <p className="event-quote">“{value(p, 'reason')}”</p>;
  if (event.eventType === 'PROOF_RECORDED') return <div className="event-lines"><span><strong>{t('verifiedProof')}</strong> · Sepolia</span><span className="mono">{short(value(p, 'txHash') ?? '—', 12, 8)}</span></div>;
  if (event.eventType === 'AUDIT_RESULT') return <div className="event-lines"><span><VerdictBadge verdict={value(p, 'verdict') ?? 'INCONCLUSIVE'} /></span><span>{value(p, 'summary')}</span></div>;
  return null;
}

function Timeline({ events }: { events: CaseEvent[] }) {
  const { t, i18n } = useTranslation();
  const date = useDate();
  return <section className="surface timeline-surface"><div className="section-heading"><div><h2>{t('evidenceTimeline')}</h2><p>{t('timelineIntro')}</p></div><span className="timeline-count">{events.length}</span></div>
    {!events.length ? <div className="empty-panel">{t('noEvents')}</div> : <ol className="timeline">{[...events].sort((a, b) => a.sequence - b.sequence).map((event) => <li key={event.id} className="timeline-item">
      <time className="event-time" dateTime={event.occurredAt} title={date(event.occurredAt)}>{new Intl.DateTimeFormat(i18n.language === 'ko' ? 'ko-KR' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(event.occurredAt))}</time>
      <div className="event-type"><span title={t(eventNames[event.eventType] ?? event.eventType)}>{event.eventType}</span><small>{t(`actors.${event.actorType}`, { defaultValue: event.actorType })}</small></div>
      <div className="timeline-content"><EventBody event={event} /><div className="event-meta">{t(`sources.${event.source}`, { defaultValue: event.source.replaceAll('_', ' ') })}{event.verificationLevel === 'ON_CHAIN' && <span> · {t('onChain')}</span>}</div></div>
    </li>)}</ol>}
  </section>;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="detail-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function DetailPanels({ detail }: { detail: CaseDetail }) {
  const { t } = useTranslation();
  const date = useDate();
  const policy = detail.currentPolicy;
  const payment: Payment | undefined = detail.payments[0];
  const proof: Proof | undefined = detail.proofs[0];
  const audit = detail.audits[0];
  const auditInvocation = detail.modelInvocations.find((item) => item.flowType === 'AUDIT_EXPLANATION' && item.success);
  const verification = useQuery({ queryKey: ['proof-verification', detail.id, proof?.txHash], queryFn: () => api.verifyProof(detail.id), enabled: Boolean(proof), staleTime: 60_000 });
  return <aside className="detail-panels">
    <section className="surface info-panel"><div className="panel-heading"><h2>{t('currentPolicy')}</h2>{policy && <span className="panel-caption">v{policy.version}</span>}</div>{policy ? <dl>
      <DetailRow label={t('maxAmount')}><strong>{money(policy.maxAmount, policy.currency)}</strong></DetailRow>
      <DetailRow label={t('currency')}>{policy.currency ?? '—'}</DetailRow>
      <DetailRow label={t('allowedMerchants')}>{policy.allowedMerchants.join(', ') || '—'}</DetailRow>
      <DetailRow label={t('deadline')}>{policy.deadline ? date(policy.deadline) : '—'}</DetailRow>
    </dl> : <p className="panel-empty">{t('noPolicy')}</p>}</section>
    <section className="surface info-panel"><div className="panel-heading"><h2>{t('payment')}</h2>{payment && <span className={`payment-status ${payment.status.toLowerCase()}`}>{t(`paymentStatuses.${payment.status}`, { defaultValue: payment.status })}</span>}</div>{payment ? <dl>
      <DetailRow label={t('merchant')}>{payment.merchant}</DetailRow>
      <DetailRow label={t('subtotal')}>{money(payment.subtotal, payment.currency)}</DetailRow>
      <DetailRow label={t('fee')}>{money(payment.fee, payment.currency)}</DetailRow>
      <DetailRow label={t('total')}><strong>{money(payment.totalAmount, payment.currency)}</strong></DetailRow>
    </dl> : <p className="panel-empty">{t('noPayment')}</p>}</section>
    <section className="surface info-panel proof-panel"><div className="panel-heading"><h2>{t('blockchainProof')}</h2><ShieldCheck size={17} /></div>{proof ? <><dl>
      <DetailRow label={t('status')}><span>{t(`proofStatuses.${proof.status}`, { defaultValue: proof.status })}</span></DetailRow>
      <DetailRow label={t('chain')}>Sepolia · {proof.chainId}</DetailRow>
      <DetailRow label={t('contract')}><span className="mono">{short(proof.contractAddress, 8, 6)}</span></DetailRow>
      <DetailRow label={t('transaction')}><span className="mono">{short(proof.txHash, 8, 6)}</span></DetailRow>
      <DetailRow label={t('blockNumber')}><span className="mono">{proof.blockNumber ?? '—'}</span></DetailRow>
      <DetailRow label={t('integrity')}><span className={verification.data?.verified ? 'success-text' : verification.isError || verification.data ? 'danger-text' : 'muted'}>{verification.isPending ? t('checkingProof') : verification.isError ? t('proofCheckError') : verification.data?.verified ? t('verifiedProof') : t('unverifiedProof')}</span></DetailRow>
    </dl><a className="external-link" href={`https://sepolia.etherscan.io/tx/${proof.txHash}`} target="_blank" rel="noopener noreferrer">{t('viewTransaction')}<ExternalLink size={15} /></a></> : <p className="panel-empty">{t('noProof')}</p>}</section>
    <section className="surface info-panel audit-panel"><div className="panel-heading"><h2>{t('audit')}</h2>{audit && <VerdictBadge verdict={audit.verdict} />}</div>{audit ? <><p className="audit-summary">{audit.summary}</p>{audit.violations.length > 0 && <div className="violations"><div className="mini-label">{t('violations')}</div>{audit.violations.map((item, index) => <p key={`${item.rule}-${index}`}>{item.description}</p>)}</div>}<div className="audit-meta">{t('generatedBy', { model: audit.model, tokens: auditInvocation?.totalTokens.toLocaleString() ?? '—' })}</div></> : <p className="panel-empty">{t('noAudit')}</p>}</section>
  </aside>;
}

function CaseDetailPage() {
  const { caseId = '' } = useParams();
  const { t } = useTranslation();
  const detail = useQuery({ queryKey: ['case', caseId], queryFn: () => api.case(caseId), enabled: Boolean(caseId) });
  const events = useQuery({ queryKey: ['events', caseId], queryFn: () => api.events(caseId), enabled: Boolean(caseId) });
  const isLoading = detail.isPending || events.isPending;
  const isError = detail.isError || events.isError;
  return <AppShell><Link className="back-link" to="/cases"><ArrowLeft size={15} />{t('backToCases')}</Link>
    <RequestState loading={isLoading} error={isError} retry={() => { void detail.refetch(); void events.refetch(); }}>
      {detail.data && events.data && <><div className="page-heading detail-heading"><div><div className="eyebrow">{t('caseDetail')} <span className="eyebrow-divider">/</span> <span className="mono">{detail.data.id}</span></div><h1>{detail.data.title}</h1><p>{t('agent')}: {detail.data.agentName ?? (events.data.some((event) => event.eventType === 'AGENT_DECISION') ? t('externalAgent') : t('unassigned'))}</p></div><StatusBadge status={detail.data.status} /></div>
        <div className="detail-grid"><Timeline events={events.data} /><DetailPanels detail={detail.data} /></div>
      </>}
    </RequestState>
  </AppShell>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><HashRouter><Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/cases" element={<Cases />} />
  <Route path="/cases/:caseId" element={<CaseDetailPage />} />
</Routes></HashRouter></QueryClientProvider></React.StrictMode>);
