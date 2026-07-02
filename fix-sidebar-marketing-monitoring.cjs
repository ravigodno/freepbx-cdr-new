const fs = require('fs');

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');

const startMarker = "            {hasPermission('view_reports') && (\n              {hasPermission('view_marketing') && (";
const endMarker = "              {hasPermission('view_management') && (";

const start = s.indexOf(startMarker);
const end = s.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  console.error('Не нашел сломанный блок меню. Покажи sed -n 4560,4665p src/App.tsx');
  process.exit(1);
}

const replacement = `            {hasPermission('view_marketing') && (
              <button
                onClick={() => setActiveView('marketing')}
                className={\`flex items-center \${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer \${
                  activeView === 'marketing'
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                }\`}
                title={isSidebarExpanded ? "" : "Маркетинг"}
              >
                <Target className="h-5 w-5 shrink-0" />
                {isSidebarExpanded && (
                  <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                    Маркетинг
                  </span>
                )}
                {!isSidebarExpanded && (
                  <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                    Маркетинг
                  </span>
                )}
              </button>
            )}

              {/* SIDEBAR_MONITORING */}
              {hasPermission('view_monitoring') && (
                <button
                  onClick={() => setActiveView('monitoring')}
                  className={\`flex items-center \${isSidebarExpanded ? 'gap-3 px-4 py-3 justify-start w-full' : 'h-11 w-11 justify-center'} rounded-xl transition-all relative group cursor-pointer \${
                    activeView === 'monitoring'
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 shadow-inner'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent'
                  }\`}
                  title={isSidebarExpanded ? "" : "Мониторинг"}
                >
                  <Activity className="h-5 w-5 shrink-0" />
                  {isSidebarExpanded && (
                    <span className="text-xs font-semibold truncate animate-fade-in text-slate-705 dark:text-slate-200">
                      Мониторинг
                    </span>
                  )}
                  {!isSidebarExpanded && (
                    <span className="absolute left-full ml-3 px-2 py-1 rounded bg-slate-950 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md pointer-events-none">
                      Мониторинг
                    </span>
                  )}
                </button>
              )}

`;

s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(path, s);

console.log('Fixed sidebar marketing/monitoring JSX block.');
