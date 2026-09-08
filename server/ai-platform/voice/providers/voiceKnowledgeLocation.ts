// City mentions must occupy complete words and must not come from a street
// address. Short prefix matching confuses e.g. Ленина with Ленино.
export function findPriceCityMention<T>(cities:Iterable<[string,T]>,text:string):T|undefined {
  const words=text.toLocaleLowerCase("ru-RU").replace(/ё/gu,"е").match(/[\p{L}\p{N}]+/gu)||[];
  const streetMarkers=new Set(["улица","улице","улицы","улицу","ул","проспект","проспекте","проспекта","переулок","переулке","шоссе","набережная","набережной"]);
  let best:{value:T;position:number;length:number}|undefined;
  for(const [name,value] of cities){
    const parts=name.toLocaleLowerCase("ru-RU").replace(/ё/gu,"е").match(/[\p{L}\p{N}]+/gu)||[];
    if(!parts.length)continue;
    for(let index=0;index<=words.length-parts.length;index++){
      if(streetMarkers.has(words[index-1])||words[index-1]==="на")continue;
      const matches=parts.every((part,offset)=>{
        const word=words[index+offset];
        if(word===part)return true;
        if(part.length<4)return false;
        const stem=part.replace(/[аяоыийь]$/u,"");
        return word.startsWith(stem)&&/^(?:а|я|у|ю|е|и|ы|ой|ом|ем|ов|ам|ах|ь|й)?$/u.test(word.slice(stem.length));
      });
      if(matches&&(!best||index>best.position||index===best.position&&name.length>best.length))best={value,position:index,length:name.length};
    }
  }
  return best?.value;
}

// An explicit new city must not silently inherit the previous city. Network
// names and non-geographic phrases are not city evidence.
export function hasUnlistedPriceCity(cities:Iterable<[string,unknown]>,text:string,networks:string[]):boolean {
  const entries=[...cities],ignored=new Set(['магазине','магазин','супермаркете','супермаркет','торговом','зале','том','этом','час','месяц','день','неделю','сутки','рублях','пределах','течение','целом','первом','следующем']);
  for(const match of text.toLowerCase().matchAll(/(?:^|\s)(?:в|во)\s+(?:городе\s+)?([\p{L}-]+)/gu)){
    const word=match[1];
    if(ignored.has(word))continue;
    if(networks.some(network=>{const name=network.toLowerCase().trim(),phonetic=(value:string)=>value.replace(/[ьъ]/gu,'').replace(/д/gu,'т');return name&&((word.startsWith(name)&&/^(?:е|а|у|ом)?$/u.test(word.slice(name.length)))||phonetic(word)===phonetic(name));}))continue;
    if(findPriceCityMention(entries,`в ${word}`)!==undefined)continue;
    return true;
  }
  return false;
}
