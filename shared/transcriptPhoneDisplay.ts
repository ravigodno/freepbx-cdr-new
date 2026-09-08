// Display-only normalization: never modifies the saved recognition or recovers
// masked digits. Accept only complete 11-digit Russian phone representations.
const numbers:Record<string,number>={ноль:0,нуль:0,один:1,одна:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,девять:9,десять:10,одиннадцать:11,двенадцать:12,тринадцать:13,четырнадцать:14,пятнадцать:15,шестнадцать:16,семнадцать:17,восемнадцать:18,девятнадцать:19,двадцать:20,тридцать:30,сорок:40,пятьдесят:50,шестьдесят:60,семьдесят:70,восемьдесят:80,девяносто:90,сто:100,двести:200,триста:300,четыреста:400,пятьсот:500,шестьсот:600,семьсот:700,восемьсот:800,девятьсот:900};
const atom=`(?:плюс|${Object.keys(numbers).sort((a,b)=>b.length-a.length).join('|')}|\\d+)(?![\\p{L}\\p{N}])`;
const runs=new RegExp(`(?<![\\p{L}\\p{N}])(?:\\+\\s*)?${atom}(?:[\\s,–—-]+${atom})*`,'giu');
const phoneCue=/(?:телефон(?:а|у)?|(?:мой|на)\s+номер|номер\s+(?:телефона|для\s+связи)|перезвоните)(?:\s+(?:такой|будет|это))?\s*[:—-]?\s*$/iu;
const question=/(?:какой|назовите|укажите|продиктуйте).{0,45}(?:номер|телефон)|(?:номер|телефон).{0,45}(?:связаться|перезвонить)/iu;

function digitsOf(value:string):string|null {
  const tokens=value.toLowerCase().match(/[а-яё]+|\d+|\+/gu)||[];
  let output='',group:number|null=null,last=0;
  const flush=()=>{if(group!==null)output+=String(group);group=null;last=0;};
  for(let i=0;i<tokens.length;i++){
    const token=tokens[i];
    if(token==='плюс'||token==='+'){if(i!==0)return null;continue;}
    if(/^\d+$/u.test(token)){flush();output+=token;continue;}
    const n=numbers[token];if(n===undefined)return null;
    const additive=group!==null&&((last>=100&&n>0&&n<100)||(last>=20&&last<100&&last%10===0&&n>0&&n<10));
    if(additive){group!+=n;last=n;}else{flush();group=n;last=n;}
  }
  flush();return /^[78]\d{10}$/u.test(output)?output:null;
}

export function formatTranscriptPhones(text:string,previousText=''):string {
  return String(text||'').replace(runs,(value:string,offset:number)=>{
    const before=text.slice(0,offset),after=text.slice(offset+value.length);
    const explicit=phoneCue.test(before)&&!/(?:артикул|заказ|сч[её]т|цена|стоимость|адрес)\s*[^.!?]*$/iu.test(before);
    const standalone=!before.trim()&&!after.replace(/[.!?]/gu,'').trim()&&question.test(previousText)&&!/(?:артикул|заказ|сч[её]т|адрес|квартир|номер\s+дома)/iu.test(previousText);
    if(!explicit&&!standalone)return value;
    const digits=digitsOf(value);if(!digits)return value;
    const plus=/^(?:\+|плюс)/iu.test(value.trim());
    return `${plus?'+':''}${digits[0]} ${digits.slice(1,4)} ${digits.slice(4,7)}-${digits.slice(7,9)}-${digits.slice(9)}`;
  });
}
