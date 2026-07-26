import React from 'react';
import { Bot, FileText, Settings } from 'lucide-react';

export type AiPlatformSection='agents'|'scripts'|'assistant'|'settings'|'skills'|'knowledge'|'conversations';
const items:Array<{key:AiPlatformSection;label:string;icon:any;href:string}>=[
  {key:'agents',label:'AI-сотрудники',icon:Bot,href:'/ai-platform/agents'},
  {key:'scripts',label:'AI-скрипты',icon:FileText,href:'/ai-platform/scripts'},
  {key:'assistant',label:'AI-автоответчик',icon:Bot,href:'/ai-platform/assistant'},
  {key:'settings',label:'Настройки платформы',icon:Settings,href:'/ai-platform/settings'},
];

export default function AiPlatformNavigation({active,canViewPlatform,canViewScripts,canViewAssistant}:{active:AiPlatformSection;canViewPlatform:boolean;canViewScripts:boolean;canViewAssistant:boolean}){
  const visibleItems=items.filter(item=>item.key==='scripts'?canViewScripts:item.key==='assistant'?canViewAssistant:canViewPlatform);
  return <nav aria-label="AI Platform" className="flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
    {visibleItems.map(item=>{const Icon=item.icon;return <a key={item.key} href={item.href} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${active===item.key?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4"/>{item.label}</a>})}
  </nav>;
}
