export const AI_EXTENSION_CONTEXT = "pbxpuls-ai";
export const AI_EXTENSION_OBJECT_TYPE = "misc_application_custom_destination";

export type AiExtensionStatus =
  | "draft" | "preview_ready" | "applying" | "verifying" | "active" | "disabled"
  | "conflict" | "sync_failed" | "archived";

export type AiExtensionFallbackType =
  | "extension" | "ring_group" | "queue" | "external" | "terminate_call";

export function normalizeAiExtension(value:unknown){
  const extension=String(value||"").trim();
  if(!/^[0-9]{2,8}$/.test(extension))
    throw new Error("invalid_extension");
  return extension;
}

export function fallbackDialplanTarget(type:AiExtensionFallbackType,value:string){
  if(type==="terminate_call")return"hangup";
  if(!/^[0-9]{2,20}$/.test(value))throw new Error("invalid_fallback");
  if(type==="extension")return`from-did-direct,${value},1`;
  if(type==="ring_group")return`ext-group,${value},1`;
  if(type==="queue")return`ext-queues,${value},1`;
  if(type==="external")return`from-internal,${value},1`;
  throw new Error("invalid_fallback");
}
