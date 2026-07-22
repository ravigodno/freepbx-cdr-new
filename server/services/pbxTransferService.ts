export type PBXTransferDestinationType='extension'|'queue'|'ring_group';
export interface PBXTransferDestination{type:PBXTransferDestinationType;ref:string;safeLabel:string;available:boolean}
export interface PBXLiveCallContext{liveCallId:string;active:boolean;channelRef:string}
export interface PBXTransferResult{ok:boolean;actionRef:string|null;safeMessage:string}
export interface PBXTransferService{
  resolveDestination(type:PBXTransferDestinationType,ref:string,signal?:AbortSignal):Promise<PBXTransferDestination|null>;
  resolveLiveCall(liveCallId:string,signal?:AbortSignal):Promise<PBXLiveCallContext|null>;
  executeBlindTransfer(context:PBXLiveCallContext,destination:PBXTransferDestination,signal?:AbortSignal):Promise<PBXTransferResult>;
  getTransferStatus(actionRef:string,signal?:AbortSignal):Promise<'completed'|'failed'|'unknown'>;
}

export function createPBXTransferService(deps:{
  resolveDestination:PBXTransferService['resolveDestination'];
  resolveLiveCall:PBXTransferService['resolveLiveCall'];
  executeBlindTransfer:PBXTransferService['executeBlindTransfer'];
  getTransferStatus?:PBXTransferService['getTransferStatus'];
}):PBXTransferService{return{...deps,getTransferStatus:deps.getTransferStatus||(async()=> 'unknown')}}
