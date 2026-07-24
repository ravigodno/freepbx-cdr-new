import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const run=promisify(execFile);
const helper=path.join(process.cwd(),"scripts","freepbx-ai-extension.php");

export interface FreePbxAiExtensionInspection{
  ok:boolean;extension:string;conflicts:Array<{type:string;name:string}>;
  customDestination:any[];miscApplication:any[];legacyRoutePresent:boolean;
  managedBlockPresent:boolean;dependencies:Array<{type:string;name:string}>;
  dialplanFile:{path:string;owner:string;group:string;mode:string|null;includedBy:string};
  plannedDialplan:{
    atomicWrite:boolean;owner:string;group:string;mode:string;context:string;extension:string;
    continuousRecording:boolean;recordingStartsBeforeStasis:boolean;
    recordingPersistsAcrossHandoff:boolean;recordingFilenamePattern:string;
    duplicateRecordingSuppression:string;legacyRoutePresent:boolean;
    preservedCustomContexts:string[];
  };
}

export class FreePbxAiExtensionAdapter{
  private async command(args:string[]){
    try{
      const{stdout}=await run("php",[helper,...args],{timeout:15000,maxBuffer:512*1024});
      return JSON.parse(String(stdout||"{}"));
    }catch(error:any){
      const output=String(error?.stdout||"");
      let providerCode="";
      try{providerCode=String(JSON.parse(output).code||"")}catch{}
      const safe=String(providerCode||output||error?.message||"freepbx_adapter_failed")
        .replace(/(password|secret|token|api[_-]?key)\\s*[:=]\\s*\\S+/gi,"$1=********")
        .slice(0,300);
      throw new Error(safe);
    }
  }
  inspect(extension:string):Promise<FreePbxAiExtensionInspection>{
    return this.command(["inspect",extension]);
  }
  apply(extension:string,displayName:string,fallbackTarget:string){
    return this.command(["apply",extension,displayName,fallbackTarget]);
  }
  async reload(){
    const{stdout,stderr}=await run("fwconsole",["reload"],{timeout:120000,maxBuffer:1024*1024});
    return{ok:true,output:String(stdout||stderr||"").slice(-500)};
  }
  async dialplan(extension:string){
    const read=async(target:string)=>{
      const{stdout,stderr}=await run("asterisk",["-rx",`dialplan show ${target}`],{timeout:10000,maxBuffer:256*1024});
      return String(stdout||stderr||"");
    };
    return{
      managed:await read(`${extension}@pbxpuls-ai`),
      miscApplication:await read(`${extension}@app-miscapps`),
      fromInternal:await read(`${extension}@from-internal`)
    };
  }
}
