import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Copy, Download, KeyRound, Radio, Server, X } from "lucide-react";

type Props = {
  oneTimeToken?: string;
  webhookPath?: string;
  onDismissToken?: () => void;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  window.prompt("Скопируйте значение:", value);
}

function CopyButton({ value, label = "Копировать" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void copyText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-slate-700"
    >
      {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copied ? "Скопировано" : label}
    </button>
  );
}

export default function SiteFormsSetupGuide({ oneTimeToken = "", webhookPath = "", onDismissToken }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [mode, setMode] = useState<"webhook" | "pull">("webhook");
  const webhookUrl = webhookPath ? `${window.location.origin}${webhookPath}` : "https://pbxpuls.example.ru/api/integrations/site-forms/ID/webhook";
  const authorization = oneTimeToken ? `Bearer ${oneTimeToken}` : "Bearer ВАШ_ОДНОРАЗОВЫЙ_ТОКЕН";
  const curlExample = useMemo(() => `curl -X POST '${webhookUrl}' \\
  -H 'Authorization: ${authorization}' \\
  -H 'Content-Type: application/json' \\
  --data '{"eventId":"site-form-1001","formId":"callback","fields":{"name":"Иван","phone":"+7 999 123-45-67","comment":"Прошу перезвонить"}}'`, [authorization, webhookUrl]);
  const phpExample = useMemo(() => `<?php
$payload = [
  'eventId' => 'site-form-' . $resultId,
  'formId' => 'callback',
  'fields' => ['name' => $name, 'phone' => $phone, 'comment' => $comment],
];
$context = stream_context_create(['http' => [
  'method' => 'POST',
  'header' => "Authorization: ${authorization}\\r\\nContent-Type: application/json\\r\\n",
  'content' => json_encode($payload, JSON_UNESCAPED_UNICODE),
]]);
file_get_contents('${webhookUrl}', false, $context);`, [authorization, webhookUrl]);

  return (
    <div className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/50 shadow-sm">
      <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="rounded-xl bg-blue-600 p-2 text-white"><Server className="h-5 w-5" /></span>
        <span><b className="block text-sm text-slate-900">Как подключить сайт</b><span className="text-xs text-slate-600">Выберите способ и выполните шаги проверки</span></span>
        <ChevronDown className={`ml-auto h-5 w-5 text-slate-500 transition ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <div className="border-t border-blue-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setMode("webhook")} className={`rounded-xl border p-4 text-left ${mode === "webhook" ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/10" : "border-slate-200"}`}>
            <Radio className="mb-2 h-5 w-5 text-blue-600" /><b className="text-sm">Webhook</b><span className="mt-1 block text-xs text-slate-500">Сайт отправляет каждую новую заявку в PBXPuls.</span>
          </button>
          <button type="button" onClick={() => setMode("pull")} className={`rounded-xl border p-4 text-left ${mode === "pull" ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/10" : "border-slate-200"}`}>
            <Server className="mb-2 h-5 w-5 text-violet-600" /><b className="text-sm">1С-Битрикс Pull API</b><span className="mt-1 block text-xs text-slate-500">PBXPuls периодически забирает результаты выбранных форм.</span>
          </button>
        </div>
        {mode === "webhook" ? <div className="mt-4 space-y-4 text-xs text-slate-700">
          <ol className="list-decimal space-y-2 pl-5"><li>Создайте интеграцию и сохраните показанный токен.</li><li>Передайте URL и токен разработчику сайта через защищённый канал.</li><li>Настройте POST JSON после успешной отправки формы.</li><li>Нажмите «Проверить» и затем «Тестовая заявка» в карточке интеграции.</li></ol>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900"><b>Важно:</b> токен хранится только в серверной конфигурации сайта. Не вставляйте его в браузерный JavaScript, публичный репозиторий или чат.</div>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">Пример curl</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{curlExample}</pre><div className="mt-2"><CopyButton value={curlExample} /></div></details>
          <details className="rounded-xl border p-3"><summary className="cursor-pointer font-bold">Пример PHP</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">{phpExample}</pre><div className="mt-2"><CopyButton value={phpExample} /></div></details>
        </div> : <div className="mt-4 text-xs text-slate-700"><a href="/downloads/pbxpuls-bitrix-connector-v5.8.3.zip" download className="mb-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-black text-white"><Download className="h-4 w-4" />Скачать модуль для 1С-Битрикс</a><ol className="list-decimal space-y-2 pl-5"><li>Распакуйте модуль и объедините каталог <code>local/</code> с каталогом <code>local/</code> сайта.</li><li>Войдите администратором и откройте <code>/local/api/pbxpuls/setup.php</code>.</li><li>Создайте одноразовый код и введите его в мастере PBXPuls.</li><li>Выберите сайты и формы, затем включите сбор кликов по телефонам.</li><li>Подтвердите тестовую синхронизацию.</li></ol><div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">PBXPuls не получает пароль администратора. Pull API только читает результаты форм, а tracker собирает клики по ссылкам <code>tel:</code>.</div></div>}
      </div>}
      {oneTimeToken && <div className="border-t border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-5 w-5 text-amber-700" /><div className="min-w-0 flex-1"><b className="text-sm text-amber-950">Сохраните токен в серверной конфигурации сайта</b><p className="mt-1 text-xs text-amber-800">PBXPuls больше не покажет его. После настройки сайт должен передавать этот токен в заголовке Authorization.</p></div>{onDismissToken && <button type="button" onClick={onDismissToken}><X className="h-4 w-4" /></button>}</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded-lg border bg-white p-3 text-xs">{oneTimeToken}</code><CopyButton value={oneTimeToken} label="Токен" /></div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row"><code className="min-w-0 flex-1 break-all rounded-lg border bg-white p-3 text-xs">Authorization: Bearer {oneTimeToken}</code><CopyButton value={`Authorization: Bearer ${oneTimeToken}`} label="Заголовок" /></div>
      </div>}
    </div>
  );
}
