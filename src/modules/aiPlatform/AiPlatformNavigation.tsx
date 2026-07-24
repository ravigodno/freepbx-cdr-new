import React from 'react';
import { Bot, BookOpen, MessageSquare, Settings, Sparkles } from 'lucide-react';

export type AiPlatformSection='agents'|'skills'|'knowledge'|'conversations'|'settings';
const items:Array<{key:AiPlatformSection;label:string;icon:any;href:string}>=[
  {key:'agents',label:'AI-сотрудники',icon:Bot,href:'/ai-platform/agents'},
  {key:'skills',label:'Навыки',icon:Sparkles,href:'/ai-platform/skills'},
  {key:'knowledge',label:'Базы знаний',icon:BookOpen,href:'/ai-platform/knowledge'},
  {key:'conversations',label:'Разговоры',icon:MessageSquare,href:'/ai-platform/conversations'},
  {key:'settings',label:'Настройки',icon:Settings,href:'/ai-platform/settings'},
];

export default function AiPlatformNavigation({active}:{active:AiPlatformSection}){
  return <nav aria-label="AI Platform" className="flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
    {items.map(item=>{const Icon=item.icon;return <a key={item.key} href={item.href} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold ${active===item.key?'bg-blue-600 text-white':'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4"/>{item.label}</a>})}
  </nav>;
}
