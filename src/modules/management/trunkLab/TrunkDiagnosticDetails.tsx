import { Card, StatusBadge } from '../../../components/ui/DesignSystem';
import { ui } from '../../../locales/ru';
import { TrunkDiagnostic } from './trunkLabTypes';
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

export function TrunkDiagnosticDetails({ diagnostic }: { diagnostic?: TrunkDiagnostic }) {
  const t = ui.management.trunkLab.details;
  if (!diagnostic) return <Card className="p-4 text-xs font-semibold text-slate-400">{t.empty}</Card>;

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
