export function configuredKnowledgeResponse(input:{
  rules:unknown;query:string;records:string[];
  turns:Array<{kind:string;text:string}>;
}):string|undefined {
  const rules=String(input.rules||"").trim().slice(0,6000);
  if(!rules)return undefined;
  const dialogue=input.turns.filter(turn=>["input_final","output_final"].includes(turn.kind)&&turn.text.trim())
    .slice(-8).map(turn=>({speaker:turn.kind==="input_final"?"client":"assistant",text:turn.text.slice(0,1000)}));
  return `${rules}\n\n${JSON.stringify({currentQuestion:input.query,dialogue,knowledgeRecords:input.records})}`;
}
