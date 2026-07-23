export type ConfiguredConversationIntentRoute={
  intentKey:string;
  triggerPhrases:string[];
  negativeTriggerPhrases:string[];
  responseTemplate:string;
  routeMode:"meta_response"|"skill_continuation";
  priority:number;
};

export type ConfiguredConversationIntentDecision={
  intentKey:string;
  matchedTrigger:string;
  responseTemplate:string;
  routeMode:"meta_response"|"skill_continuation";
}|null;

const normalize=(value:string)=>value.toLocaleLowerCase("ru-RU")
  .replace(/ё/gu,"е").replace(/[^\p{L}\p{N}\s]+/gu," ")
  .replace(/\s+/gu," ").trim();

export function routeConfiguredConversationIntent(
  routes:ConfiguredConversationIntentRoute[],
  text:string,
):ConfiguredConversationIntentDecision{
  const source=normalize(text);
  for(const route of [...routes].sort((a,b)=>b.priority-a.priority)){
    if(route.negativeTriggerPhrases.some(value=>source.includes(normalize(value))))continue;
    const trigger=route.triggerPhrases.find(value=>source.includes(normalize(value)));
    if(trigger)return{
      intentKey:route.intentKey,
      matchedTrigger:trigger,
      responseTemplate:route.responseTemplate,
      routeMode:route.routeMode,
    };
  }
  return null;
}

export function rowsToConfiguredConversationIntents(rows:any[]):ConfiguredConversationIntentRoute[]{
  return rows.map(row=>({
    intentKey:String(row.intent_key),
    triggerPhrases:JSON.parse(String(row.trigger_phrases_json||"[]")),
    negativeTriggerPhrases:JSON.parse(String(row.negative_trigger_phrases_json||"[]")),
    responseTemplate:String(row.response_template||""),
    routeMode:(row.route_mode==="skill_continuation"?"skill_continuation":"meta_response") as ConfiguredConversationIntentRoute["routeMode"],
    priority:Number(row.priority||0),
  })).filter(route=>route.intentKey&&route.responseTemplate&&route.triggerPhrases.length);
}

export function configuredMetaResponseForTurn(
  routes:ConfiguredConversationIntentRoute[],
  text:string,
  state:{actionResultReported:boolean;activeSkillId:number|null;lastUpdatedFields:string[]},
){
  const decision=routeConfiguredConversationIntent(routes,text);
  if(
    !decision ||
    decision.routeMode!=="meta_response" ||
    state.lastUpdatedFields.length>0 ||
    (!state.actionResultReported&&state.activeSkillId!==null)
  )return null;
  return decision;
}
