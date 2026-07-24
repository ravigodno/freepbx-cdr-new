export type AiExtensionSyncState="draft"|"preview_ready"|"applying"|"verifying"|"active"|"disabled"|"conflict"|"sync_failed"|"archived";

const transitions:Record<AiExtensionSyncState,ReadonlySet<AiExtensionSyncState>>={
  draft:new Set(["preview_ready","conflict","archived"]),
  preview_ready:new Set(["applying","conflict","archived"]),
  applying:new Set(["verifying","sync_failed"]),
  verifying:new Set(["active","sync_failed"]),
  active:new Set(["applying","disabled","preview_ready","sync_failed"]),
  disabled:new Set(["preview_ready","archived"]),
  conflict:new Set(["preview_ready","archived"]),
  sync_failed:new Set(["preview_ready","applying","archived"]),
  archived:new Set()
};

export function assertAiExtensionTransition(from:AiExtensionSyncState,to:AiExtensionSyncState){
  if(!transitions[from]?.has(to))throw new Error(`invalid_ai_extension_transition:${from}:${to}`);
}

export function verifyLoadedAiExtensionDialplan(extension:string,snapshot:{managed:string;miscApplication:string;fromInternal:string}){
  const escaped=extension.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const contextLoaded=new RegExp(`['\"]?${escaped}['\"]?\\s*=>[\\s\\S]*Stasis\\(pbxpuls-ai-control,ai_extension:${escaped}\\)`).test(snapshot.managed);
  const miscLoaded=new RegExp(`['\"]?${escaped}['\"]?\\s*=>[\\s\\S]*Goto\\(pbxpuls-ai,${escaped},1\\)`).test(snapshot.miscApplication);
  const internalUsesManaged=new RegExp(`['\"]?${escaped}['\"]?\\s*=>[\\s\\S]*(app-miscapps|pbxpuls-ai)`).test(snapshot.fromInternal)
    && !snapshot.fromInternal.includes("pbxpuls-ai-voice-test");
  return{ok:contextLoaded&&miscLoaded&&internalUsesManaged,contextLoaded,miscLoaded,internalUsesManaged};
}
