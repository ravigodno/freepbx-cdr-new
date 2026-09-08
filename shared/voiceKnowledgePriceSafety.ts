export const KNOWLEDGE_PRICE_RESPONSES={
  knowledgePriceNotFoundResponse:'В опубликованном прайсе цена для указанной площадки не найдена. Хотите уточнить её у менеджера?',
  knowledgeFrequencyMismatchResponse:'В прайсе для этой площадки указана частота {{availableFrequency}} выхода в час. Цены на {{requestedFrequency}} выхода в час нет. Уточнить этот вариант у менеджера?',
};
export function requestedHourlyFrequency(text:string):number|null {
  const match=/(?:^|\s)(\d{1,2}|один|одного|два|двух|три|трех|трёх|четыре|четырех|четырёх|пять|пяти|шесть|шести)\s+выход\p{L}*\s+в\s+час/iu.exec(text);
  if(!match)return null;
  const words:Record<string,number>={один:1,одного:1,два:2,двух:2,три:3,трех:3,трёх:3,четыре:4,четырех:4,четырёх:4,пять:5,пяти:5,шесть:6,шести:6};
  return words[match[1].toLowerCase()]||Number(match[1])||null;
}
export function priceSafetyResponse(settings:Record<string,unknown>,key:keyof typeof KNOWLEDGE_PRICE_RESPONSES,variables:Record<string,string|number>={}):string {
  const template=String(settings[key]||KNOWLEDGE_PRICE_RESPONSES[key]).trim().slice(0,600);
  return template.replace(/\{\{(\w+)\}\}/g,(placeholder,name)=>name in variables?String(variables[name]):placeholder);
}
