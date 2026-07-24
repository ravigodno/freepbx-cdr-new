import React from "react";

const diagnostics = [
  "Provider format", "AudioSocket", "Transport", "Media worker",
  "Frame conservation", "Latency decomposition", "VAD debug",
  "Realtime session payload", "Action/state diagnostics",
];

export default function VoiceDiagnosticsPanel(){
  return <section id="diagnostics" className="mt-5 rounded-2xl border bg-white p-5">
    <h3 className="font-black">Диагностика голоса</h3>
    <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
      Качество произношения зависит от голосовой модели и выбранного языка. Доступные голоса предоставляются внешним провайдером.
    </p>
    <div className="mt-4 grid gap-2 md:grid-cols-3">
      {diagnostics.map(item=><div key={item} className="rounded-lg border p-3 text-sm">{item}</div>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">Startup buffer: 500 ms · media scheduler не изменён. Технические показатели доступны в расположенных ниже диагностических панелях.</p>
  </section>;
}
