import crypto from"node:crypto";
export type HumanHandoffState="idle"|"offered"|"awaiting_confirmation"|"confirmed"|"announcement_generating"|"announcement_playing"|"transfer_requested"|"transferring"|"ringing"|"answered"|"completed"|"declined"|"cancelled"|"no_answer"|"busy"|"failed"|"fallback_or_return";
const yes=/^(?:да|давайте|хорошо|согласен|согласна|соединяйте|переводите|конечно)(?:\s|[,.!]|$)/i,no=/^(?:нет|не надо|отмена|оставайтесь|не соединяйте)(?:\s|[,.!]|$)/i;
export class HumanHandoffCoordinator{
 state:HumanHandoffState="idle";announcementResponseId:string|null=null;requestCount=0;confirmationCount=0;duplicateConfirmationCount=0;transferRequestCount=0;clarificationCount=0;
 readonly sessionRef:string;constructor(ref:string){this.sessionRef=crypto.createHash("sha256").update(ref).digest("hex").slice(0,16)}
 request(confirmationRequired:boolean){this.requestCount++;if(this.state!=="idle")return{accepted:false,duplicate:true};this.state="offered";if(confirmationRequired)this.state="awaiting_confirmation";else this.state="confirmed";return{accepted:true,needsConfirmation:confirmationRequired}}
 confirmation(text:string){if(this.state!=="awaiting_confirmation"){this.duplicateConfirmationCount++;return"ignored" as const}this.confirmationCount++;if(yes.test(text.trim())){this.state="confirmed";return"confirmed" as const}if(no.test(text.trim())){this.state="declined";return"declined" as const}this.clarificationCount++;return"ambiguous" as const}
 cancel(){if(["offered","awaiting_confirmation","confirmed"].includes(this.state)){this.state="cancelled";return true}return false}
 announcementRequested(){if(this.state!=="confirmed"||this.announcementResponseId)return false;this.state="announcement_generating";return true}
 bindAnnouncement(id?:string){if(this.state!=="announcement_generating"||!id||this.announcementResponseId)return false;this.announcementResponseId=id;return true}
 playoutStarted(id?:string){if(this.state==="announcement_generating"&&id===this.announcementResponseId){this.state="announcement_playing";return true}return false}
 playoutCompleted(id?:string){if(this.state==="announcement_playing"&&id===this.announcementResponseId){this.state="transfer_requested";return true}return false}
 transferRequested(){if(this.state!=="transfer_requested"||this.transferRequestCount)return false;this.transferRequestCount++;this.state="transferring";return true}
 ringing(){if(this.state==="transferring"){this.state="ringing";return true}return false}
 answered(){if(["transferring","ringing"].includes(this.state)){this.state="answered";return true}return false}
 complete(){if(this.state==="answered"){this.state="completed";return true}return false}
 fail(kind:"no_answer"|"busy"|"failed"){if(!["transferring","ringing"].includes(this.state))return false;this.state=kind;this.state="fallback_or_return";return true}
 blocksClosing(){return !["idle","declined","cancelled","failed","no_answer","busy","fallback_or_return"].includes(this.state)}
 blocksNormalResponse(){return !["idle","declined","cancelled","fallback_or_return"].includes(this.state)}
 snapshot(){return{state:this.state,sessionRefSafe:this.sessionRef,requestCount:this.requestCount,confirmationCount:this.confirmationCount,duplicateConfirmationCount:this.duplicateConfirmationCount,transferRequestCount:this.transferRequestCount,clarificationCount:this.clarificationCount}}
}
