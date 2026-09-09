import { CheckCircle, ExternalLink, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, XCircle } from 'lucide-react';

export type RegistryIconKind = 'incoming' | 'outgoing' | 'internal' | 'missed' | 'processed' | 'lost' | 'site-form' | 'unknown';
const icons = {
  unknown: [Phone, 'text-slate-400', 'Направление не определено'],
  incoming: [PhoneIncoming, 'text-cyan-500', 'Входящий'],
  outgoing: [PhoneOutgoing, 'text-indigo-500', 'Исходящий'],
  internal: [Phone, 'text-purple-500', 'Внутренний'],
  missed: [PhoneMissed, 'text-red-500/80', 'Пропущен'],
  processed: [CheckCircle, 'text-emerald-500/80', 'Обработан'],
  lost: [XCircle, 'text-amber-500/80', 'Потерян'],
  'site-form': [ExternalLink, 'text-blue-500', 'Заявка с сайта'],
} as const;

export default function CDRRegistryIcon({ kind }: { kind: RegistryIconKind }) {
  const [Icon, color, label] = icons[kind];
  return <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-3xs ${color}`} title={label}>
    <Icon className="h-5 w-5" aria-label={label} />
  </div>;
}
