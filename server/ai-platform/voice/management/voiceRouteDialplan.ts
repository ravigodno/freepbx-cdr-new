import crypto from "node:crypto";

const safeToken=(value:string)=>value.replace(/[^A-Za-z0-9_.-]/g,'').slice(0,64);
export function buildVoiceRouteDialplanPreview(input:{bindingKey:string;sourceType:string;routeValue:string;fallbackType:string;fallbackValue?:string;stasisApplication:string;recordingEnabled:boolean},existing=''){
 const key=safeToken(input.bindingKey),route=String(input.routeValue||'').replace(/\D/g,''),app=safeToken(input.stasisApplication),fallback=safeToken(input.fallbackValue||'');
 if(!key||!route||!app)return{ready:false,code:'invalid_dialplan_input',snippet:null};
 const marker=`PBXPuls AI Route ${key}`,conflict=existing.includes(`; BEGIN ${marker}`),fallbackLine=input.fallbackType==='terminate_call'?'Hangup()':`Goto(pbxpuls-ai-fallback-${input.fallbackType},${fallback||'s'},1)`,recording=input.recordingEnabled?` same => n,Set(__CALLFILENAME=ai-\${FILTER(0-9.,\${UNIQUEID})}.wav)\n same => n,MixMonitor(\${CALLFILENAME},b)\n`:'';
 const snippet=`; BEGIN ${marker}\n[pbxpuls-ai-route-${key}]\nexten => ${route},1,NoOp(PBXPuls AI route ${key})\n${recording} same => n,Stasis(${app},binding:${key})\n same => n,${fallbackLine}\n; END ${marker}`;
 return{ready:!conflict,code:conflict?'route_block_exists':null,conflict,snippet,target:'extensions_custom.conf',backupRequired:true,validation:['marker_unique','asterisk_dialplan_syntax','fallback_target','route_conflict'],reloadCommand:'fwconsole reload',applySupported:false,rollback:{checksum:crypto.createHash('sha256').update(existing).digest('hex'),action:`Remove only BEGIN/END ${marker} block and restore validated backup`},warning:'Preview only; no FreePBX route or dialplan is changed.'};
}
