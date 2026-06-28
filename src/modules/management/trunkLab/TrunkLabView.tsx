import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, TestTube2 } from 'lucide-react';
import { Card, PageHeader, PrimaryButton, Section, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnosticDetails } from './TrunkDiagnosticDetails';
import { TrunkDiagnosticsTable } from './TrunkDiagnosticsTable';
import { TrunkLabFilters } from './TrunkLabFilters';
import { TrunkLabSummaryCards } from './TrunkLabSummaryCards';
import { TrunkDiagnostic, TrunkLabResponse } from './trunkLabTypes';
import { filterTrunkDiagnostics, initialTrunkLabFilters } from './trunkLabUtils';

export function TrunkLabView({ token }: { token?: string }) {
  const t = ui.management.trunkLab;
  const [filters, setFilters] = useState(initialTrunkLabFilters);
  const [diagnostics, setDiagnostics] = useState<TrunkDiagnostic[]>([]);
  const [selected, setSelected] = useState<TrunkDiagnostic | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedAt, setGeneratedAt] = useState('');
  const [sourceStatus, setSourceStatus] = useState<TrunkLabResponse['sourceStatus']>({});

  const loadDiagnostics = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/management/trunks/preview', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ operationType: 'trunk_lab_diagnostics', payload: { operationType: 'trunk_lab_diagnostics' } }) });
      const data: TrunkLabResponse = await res.json().catch(() => ({ success: false, diagnostics: [], summary: { total: 0, registered: 0, problems: 0, pjsip: 0, chanSip: 0, unreachable: 0, unknown: 0 }, error: t.empty.cliUnavailable }));
      if (!res.ok || data.success === false) throw new Error(data.message || data.error || t.empty.cliUnavailable);
      setDiagnostics(data.diagnostics || []);
      setGeneratedAt(data.generatedAt || '');
      setSourceStatus(data.sourceStatus || {});
      setSelected((data.diagnostics || [])[0]);
    } catch (err: any) {
      setError(err?.message || t.empty.cliUnavailable);
      setDiagnostics([]);
      setSourceStatus({});
      setSelected(undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const filtered = useMemo(() => filterTrunkDiagnostics(diagnostics, filters), [diagnostics, filters]);
  const sourceEntries = Object.entries(sourceStatus || {});
  const sourceWarnings = sourceEntries.filter(([, value]) => value.status !== 'ok');

  return (
    <Section>
      <PageHeader
        icon={TestTube2}
        title={t.title}
        description={t.description}
        actions={<PrimaryButton onClick={loadDiagnostics} disabled={loading}>{loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t.refresh}</PrimaryButton>}
      />
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
        <AlertTriangle className="mr-2 inline h-4 w-4" />{t.readOnlyWarning}
      </div>
      {generatedAt && <StatusBadge tone="neutral">{t.generatedAt}: {generatedAt}</StatusBadge>}
      {error && <Card className="border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{error}</Card>}
      {sourceEntries.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 text-xs font-black text-slate-850 dark:text-white">{t.sourceStatus.title}</div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sourceEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px] dark:border-slate-800 dark:bg-slate-800/60">
                <div className="font-mono font-black text-slate-700 dark:text-slate-200">{key}</div>
                <div className={value.status === 'ok' ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'font-bold text-amber-700 dark:text-amber-300'}>{value.status}</div>
                {value.message && <div className="mt-1 break-words text-slate-500 dark:text-slate-400">{value.message}</div>}
              </div>
            ))}
          </div>
          {sourceWarnings.length > 0 && <div className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">{t.sourceStatus.warning}</div>}
        </Card>
      )}
      <TrunkLabSummaryCards diagnostics={diagnostics} />
      <TrunkLabFilters filters={filters} onChange={setFilters} />
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.85fr)]">
        <TrunkDiagnosticsTable diagnostics={filtered} selectedId={selected?.id} onSelect={setSelected} />
        <TrunkDiagnosticDetails diagnostic={selected} />
      </div>
    </Section>
  );
}
