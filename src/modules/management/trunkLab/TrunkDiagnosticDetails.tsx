import { useState } from 'react';
import { PhoneCall, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { Card, PrimaryButton, SecondaryButton, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnostic, TrunkLabTestResult, TrunkLabTestType } from './trunkLabTypes';
import { formatRawSnippet } from './trunkLabUtils';
import { TrunkRegistrationBadge, TrunkRiskBadge, TrunkTechnologyBadge } from './TrunkDiagnosticBadges';

function TextList({ items, empty }: { items: string[]; empty: string }) {
  return <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">{items.length ? items.map(item => <li key={item}>• {item}</li>) : <li className="font-semibold text-slate-400">{empty}</li>}</ul>;
}

function FieldGrid({ items }: { items: Record<string, string> }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {Object.entries(items).map(([key, value]) => (
        <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-800/60">
          <div className="text-[10px] font-black uppercase text-slate-400">{key}</div>
          <div className="mt-1 break-words font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-200">{value || '-'}</div>
        </div>
      ))}
    </div>
  );
}

export function TrunkDiagnosticDetails({ diagnostic, testHistory = [], onRunTest }: { diagnostic?: TrunkDiagnostic; testHistory?: TrunkLabTestResult[]; onRunTest?: (testType: TrunkLabTestType, diagnostic: TrunkDiagnostic, payload?: Record<string, unknown>) => Promise<TrunkLabTestResult>; }) {
  const t = ui.management.trunkLab.details;
  const tt = ui.management.trunkLab.testing;
  const [running, setRunning] = useState('');
  const [testError, setTestError] = useState('');
  const [showCallForm, setShowCallForm] = useState(false);
  const [sourceExtension, setSourceExtension] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [timeoutSeconds, setTimeoutSeconds] = useState('30');
  const [confirmed, setConfirmed] = useState(false);
  if (!diagnostic) return <Card className="p-4 text-xs font-semibold text-slate-400">{t.empty}</Card>;

  const run = async (type: TrunkLabTestType, payload: Record<string, unknown> = {}) => {
    if (!onRunTest) return;
    setRunning(type);
    setTestError('');
    try { await onRunTest(type, diagnostic, payload); }
    catch (err: any) { setTestError(err?.message || tt.failed); }
    finally { setRunning(''); }
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-slate-850 dark:text-white">{diagnostic.name}</h4>
            <p className="mt-1 text-[11px] text-slate-500">{diagnostic.source}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TrunkTechnologyBadge technology={diagnostic.technology} />
            <TrunkRegistrationBadge status={diagnostic.registrationStatus} />
            <TrunkRiskBadge risk={diagnostic.riskLevel} />
          </div>
        </div>

        {diagnostic.templateSuggestion && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            {t.templateSuggestion}: {diagnostic.templateSuggestion}
          </div>
        )}

        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.summary}</h5>
          <FieldGrid items={{ summary: diagnostic.summary, displayName: diagnostic.displayName || diagnostic.name, trunkid: String(diagnostic.trunkid || ''), tech: diagnostic.tech || diagnostic.technology, channelId: diagnostic.channelId || '', outcid: diagnostic.outcid || '', disabled: typeof diagnostic.disabled === 'boolean' ? String(diagnostic.disabled) : '', rawPeerName: diagnostic.rawPeerName || '', registryUsername: diagnostic.registryUsername || '', registryHost: diagnostic.registryHost || '', peerHost: diagnostic.peerHost || '', peerPort: diagnostic.peerPort || '', rtt: diagnostic.rtt || '', networkStatus: diagnostic.networkStatus, authStatus: diagnostic.authStatus }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.registration}</h5>
          <FieldGrid items={{ registrationStatus: diagnostic.registrationStatus }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.endpoint}</h5>
          <FieldGrid items={{ endpointStatus: diagnostic.endpointStatus }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.contacts}</h5>
          <FieldGrid items={{ contactStatus: diagnostic.contactStatus }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.auth}</h5>
          <FieldGrid items={{ authStatus: diagnostic.authStatus }} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.problems}</h5>
          <TextList items={diagnostic.problems} empty={ui.management.trunkLab.empty.noProblems} />
        </section>
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.recommendations}</h5>
          <TextList items={diagnostic.recommendations} empty={ui.management.trunkLab.empty.noRecommendations} />
        </section>
        {Array.isArray(diagnostic.notes) && diagnostic.notes.length > 0 && (
          <section className="space-y-2">
            <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.notes}</h5>
            <TextList items={diagnostic.notes} empty="-" />
          </section>
        )}
        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{tt.title}</h5>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => run('trunk_lab_registration_test')} disabled={!!running}><ShieldCheck className="h-4 w-4" />{tt.registration}</SecondaryButton>
            <SecondaryButton onClick={() => run('trunk_lab_peer_test')} disabled={!!running}><Wifi className="h-4 w-4" />{tt.peer}</SecondaryButton>
            <PrimaryButton onClick={() => setShowCallForm(value => !value)} disabled={!!running}><PhoneCall className="h-4 w-4" />{tt.outbound}</PrimaryButton>
          </div>
          {running && <div className="text-xs font-semibold text-blue-700 dark:text-blue-300"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />{tt.running}</div>}
          {testError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">{testError}</div>}
          {showCallForm && (
            <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
              <div className="text-xs font-semibold text-amber-800 dark:text-amber-200">{tt.callWarning}</div>
              <div className="grid gap-2 md:grid-cols-3">
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder={tt.sourceExtension} value={sourceExtension} onChange={event => setSourceExtension(event.target.value)} />
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder={tt.testNumber} value={testNumber} onChange={event => setTestNumber(event.target.value)} />
                <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900" placeholder={tt.timeout} value={timeoutSeconds} onChange={event => setTimeoutSeconds(event.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{tt.confirm}</label>
              <PrimaryButton disabled={!confirmed || !!running} onClick={() => run('trunk_lab_outbound_call_test', { sourceExtension, testNumber, timeoutSeconds: Number(timeoutSeconds) || 30, confirmed })}><PhoneCall className="h-4 w-4" />{tt.startCall}</PrimaryButton>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h5 className="text-xs font-black text-slate-850 dark:text-white">{tt.results}</h5>
          <div className="space-y-2">
            {testHistory.length ? testHistory.map(item => (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-black text-slate-700 dark:text-slate-200">{item.testType}</span>
                  <span className="text-[11px] text-slate-400">{item.timestamp}</span>
                </div>
                <div className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{item.summary || '-'}</div>
                <TextList items={item.problems} empty={ui.management.trunkLab.empty.noProblems} />
                <TextList items={item.recommendations} empty={ui.management.trunkLab.empty.noRecommendations} />
                {item.raw && <pre className="mt-2 max-h-36 overflow-auto rounded-lg bg-slate-950 p-2 text-[11px] text-slate-100">{formatRawSnippet(JSON.stringify(item.raw))}</pre>}
              </div>
            )) : <div className="text-xs font-semibold text-slate-400">{tt.noResults}</div>}
          </div>
        </section>
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h5 className="text-xs font-black text-slate-850 dark:text-white">{t.raw}</h5>
            <StatusBadge tone="neutral">{t.masked}</StatusBadge>
          </div>
          <div className="space-y-2">
            {Object.entries(diagnostic.rawRefs).map(([key, value]) => (
              <pre key={key} className="max-h-44 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{key}\n{formatRawSnippet(value) || '-'}</pre>
            ))}
          </div>
        </section>
      </div>
    </Card>
  );
}
