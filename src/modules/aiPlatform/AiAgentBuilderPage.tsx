import React,{useEffect,useMemo,useState}from'react';
import{Activity,BookOpen,ChevronDown,KeyRound,Plug,Settings2,Volume2}from'lucide-react';
import AiPlatformNavigation,{type AiPlatformSection}from'./AiPlatformNavigation';
import AiPlatformAgentList from'./AiPlatformAgentList';
import AiAgentEditor from'./AiAgentEditor';
import SkillBuilderPanel from'./SkillBuilderPanel';
import AgentKnowledgeTrainingPage from'./AgentKnowledgeTrainingPage';
import VoiceAgentsManagementPage from'./VoiceAgentsManagementPage';
import VoiceSettingsPanel from'./VoiceSettingsPanel';
import VoiceDiagnosticsPanel from'./VoiceDiagnosticsPanel';
import AgentSandboxPanel from'./AgentSandboxPanel';
import TransferRequestsPanel from'./TransferRequestsPanel';
import BusinessActionsPanel from'./BusinessActionsPanel';
import VoiceGatewayPanel from'./VoiceGatewayPanel';
import VoiceMediaPanel from'./VoiceMediaPanel';
import RealtimeVoicePanel from'./RealtimeVoicePanel';
import IntegrationManagementPanel from'./IntegrationManagementPanel';

interface Props{
 canCreateAgents?:boolean;
 canViewIntegrations?:boolean;canCreateIntegrations?:boolean;canEditIntegrations?:boolean;canTestIntegrations?:boolean;
 token:string;canCreate:boolean;canViewKnowledge:boolean;canViewTraining:boolean;canViewTransfers:boolean;canTestTransfer:boolean;canViewCallbacks:boolean;canManageCallbacks:boolean;canAssignActions:boolean;canViewVoice:boolean;canManageVoice:boolean;canTestVoice:boolean;canViewMedia:boolean;canTestMedia:boolean;canViewRealtime:boolean;canTestRealtime:boolean;canViewLive:boolean;canConfigureLive:boolean;canEnableLive:boolean;canCheckLive:boolean;canViewVoiceAgents:boolean;canManageVoiceAgents:boolean;canTestVoiceAgents:boolean;canViewVoiceTranscripts:boolean;canExportVoiceTranscripts:boolean;canViewVoiceSettings:boolean;canManageVoiceSettings:boolean;canViewAiExtensions:boolean;canCreateAiExtensions:boolean;canUpdateAiExtensions:boolean;canPublishAiExtensions:boolean;canViewHandoff:boolean;canConfigureHandoff:boolean;canPublishHandoff:boolean;canPublishAgents?:boolean;canExpertMode?:boolean;
}
const sectionFromPath=():AiPlatformSection=>location.pathname.startsWith('/ai-platform/skills')?'skills':location.pathname.startsWith('/ai-platform/knowledge')?'knowledge':location.pathname.startsWith('/ai-platform/conversations')?'conversations':location.pathname.startsWith('/ai-platform/settings')||location.pathname.startsWith('/ai-platform/diagnostics')||/\/agents\/\d+\/diagnostics$/.test(location.pathname)?'settings':'agents';

export default function AiAgentBuilderPage(props:Props){
 const{token}=props,[section]=useState(sectionFromPath),agentId=Number(location.pathname.match(/^\/ai-platform\/agents\/(\d+)/)?.[1]||0),[expertMode,setExpertMode]=useState(()=>props.canExpertMode&&localStorage.getItem('pbxpuls_ai_expert_mode')==='true');
 useEffect(()=>{if(props.canExpertMode)localStorage.setItem('pbxpuls_ai_expert_mode',String(expertMode))},[expertMode,props.canExpertMode]);
 const permissions=useMemo(()=>({...props,canEdit:props.canCreate,canPublishAgents:props.canPublishAgents}),[props]);
 return <section className="mx-auto max-w-[1440px] space-y-4">
  <AiPlatformNavigation active={section}/>
  <main className="min-w-0">
   {section==='agents'&&!agentId&&<AiPlatformAgentList token={token} canEdit={props.canCreate} canCreate={Boolean(props.canCreateAgents??props.canCreate)}/>}
   {section==='agents'&&agentId>0&&<AiAgentEditor token={token} agentId={agentId} expertMode={Boolean(expertMode)} permissions={permissions}/>}
   {section==='skills'&&<SimpleSurface title="Навыки" text="Настройте, что AI-сотрудники умеют делать."><SkillBuilderPanel token={token} agentId={1} enabled canManage={props.canCreate}/></SimpleSurface>}
   {section==='knowledge'&&<SimpleSurface title="Базы знаний" text="Подключите инструкции, ответы и справочники."><AgentKnowledgeTrainingPage token={token} agentId={1} enabled canViewKnowledge={props.canViewKnowledge} canViewTraining={props.canViewTraining}/></SimpleSurface>}
   {section==='conversations'&&<SimpleSurface title="Разговоры" text="Каждый звонок показан одной понятной записью."><VoiceAgentsManagementPage token={token} canView={props.canViewVoiceAgents} canManage={false} canTest={props.canTestVoiceAgents} canViewTranscripts={props.canViewVoiceTranscripts} canExportTranscripts={props.canExportVoiceTranscripts} canConfigureVoice={false} simpleMode={!expertMode}/></SimpleSurface>}
   {section==='settings'&&<SettingsWorkspace {...props} expertMode={Boolean(expertMode)} onExpertModeChange={setExpertMode}/>}
  </main>
 </section>
}

function SimpleSurface({title,text,children}:{title:string;text:string;children:React.ReactNode}){return <section className="space-y-4"><div><h1 className="text-2xl font-black">{title}</h1><p className="mt-1 text-sm text-slate-500">{text}</p></div>{children}</section>}
function SettingsWorkspace(props:Props&{expertMode:boolean;onExpertModeChange:(value:boolean)=>void}){
 const[sub,setSub]=useState<'voices'|'providers'|'integrations'|'access'|'diagnostics'>(()=>location.pathname.startsWith('/ai-platform/diagnostics')?'diagnostics':'voices');
 const tabs=[['voices','Голоса',Volume2],['providers','Провайдеры',Activity],['integrations','Интеграции',Plug],['access','Права доступа',KeyRound],...(props.canExpertMode?[['diagnostics','Диагностика',Settings2] as const]:[]) ] as const;
 return <section className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-black">Настройки</h1><p className="text-sm text-slate-500">Голоса, подключения и права доступа.</p></div>{props.canExpertMode&&<label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold"><input type="checkbox" checked={props.expertMode} onChange={event=>props.onExpertModeChange(event.target.checked)}/>Показать расширенные настройки</label>}</div><div className="flex flex-wrap gap-2">{tabs.map(([key,label,Icon])=><button key={key} onClick={()=>setSub(key)} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${sub===key?'bg-blue-600 text-white':'border bg-white'}`}><Icon className="h-4 w-4"/>{label}</button>)}</div>
  {sub==='voices'&&<VoiceSettingsPanel token={props.token} agentId={1} canManage={props.canManageVoiceSettings} expertMode={props.expertMode}/>}
  {sub==='providers'&&<InfoCard title="Голосовой сервис" text="OpenAI Realtime · подключено"/>}
  {sub==='integrations'&&<IntegrationManagementPanel token={props.token} canView={Boolean(props.canViewIntegrations??props.canCreate)} canCreate={Boolean(props.canCreateIntegrations??props.canCreate)} canEdit={Boolean(props.canEditIntegrations??props.canCreate)} canTest={Boolean(props.canTestIntegrations??props.canCreate)}/>}
  {sub==='access'&&<InfoCard title="Права доступа" text="Права назначаются ролям в разделе управления пользователями."/>}
  {sub==='diagnostics'&&props.canExpertMode&&<details open={props.expertMode} className="rounded-2xl border bg-white p-4"><summary className="flex cursor-pointer items-center gap-2 font-black"><ChevronDown className="h-4 w-4"/>Техническая диагностика</summary><div className="mt-4 space-y-4"><VoiceDiagnosticsPanel/><AgentSandboxPanel token={props.token} agentId={1}/><TransferRequestsPanel token={props.token} enabled canView={props.canViewTransfers} canTest={props.canTestTransfer}/><BusinessActionsPanel token={props.token} enabled agentId={1} canView={props.canViewCallbacks} canManage={props.canManageCallbacks} canAssign={props.canAssignActions}/><VoiceGatewayPanel token={props.token} canView={props.canViewVoice} canManage={props.canManageVoice} canTest={props.canTestVoice}/><VoiceMediaPanel token={props.token} canView={props.canViewMedia} canTest={props.canTestMedia}/><RealtimeVoicePanel token={props.token} canView={props.canViewRealtime} canTest={props.canTestRealtime}/></div></details>}
 </section>
}
function InfoCard({title,text}:{title:string;text:string}){return <div className="rounded-2xl border bg-white p-5"><h2 className="font-black">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></div>}
