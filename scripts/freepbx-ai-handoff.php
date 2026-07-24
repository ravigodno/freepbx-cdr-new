<?php
declare(strict_types=1);
require_once '/etc/freepbx.conf';
function handoffOut($value,int $code=0):void{echo json_encode($value,JSON_UNESCAPED_UNICODE),PHP_EOL;exit($code);}
function safe($value,int $max=191):string{return mb_substr(trim(strip_tags((string)$value)),0,$max);}
function validToken(string $value):string{if(!preg_match('/^handoff-[a-f0-9]{12}$/',$value))handoffOut(['ok'=>false,'code'=>'invalid_token'],1);return$value;}
function targets($db):array{
 $rows=[];
 $add=function($type,$ref,$name,$target)use(&$rows){$rows[]=['type'=>$type,'ref'=>(string)$ref,'name'=>safe($name),'target'=>$target,'active'=>true];};
 foreach($db->fetchAll("SELECT extension ref,name FROM users WHERE extension REGEXP '^[0-9]{2,8}$' ORDER BY extension")as$r)$add('extension',$r['ref'],$r['name']?:$r['ref'],"from-did-direct,{$r['ref']},1");
 foreach($db->fetchAll("SELECT extension ref,descr name FROM queues_config WHERE extension REGEXP '^[0-9]{2,8}$' ORDER BY extension")as$r)$add('queue',$r['ref'],$r['name']?:$r['ref'],"ext-queues,{$r['ref']},1");
 foreach($db->fetchAll("SELECT grpnum ref,description name FROM ringgroups WHERE grpnum REGEXP '^[0-9]{2,8}$' ORDER BY grpnum")as$r)$add('ring_group',$r['ref'],$r['name']?:$r['ref'],"ext-group,{$r['ref']},1");
 try{foreach($db->fetchAll("SELECT id ref,name FROM ivr_details ORDER BY id")as$r)$add('ivr',$r['ref'],$r['name']?:$r['ref'],"ivr-{$r['ref']},s,1");}catch(Throwable$ignored){}
 foreach(\FreePBX::Customappsreg()->getAllCustomDests()as$id=>$r)if(preg_match('/^[a-zA-Z0-9_-]+,[a-zA-Z0-9*#+_.-]+,[1-9][0-9]*$/',(string)($r['target']??'')))$add('custom_destination',(string)$id,$r['description']??$id,(string)$r['target']);
 return$rows;
}
$command=(string)($argv[1]??'');$db=\FreePBX::Database()->getDoctrineConnection();
if($command==='list'){handoffOut(['ok'=>true,'rows'=>targets($db)]);}
if($command==='inspect'){
 $type=(string)($argv[2]??'');$ref=(string)($argv[3]??'');$found=array_values(array_filter(targets($db),fn($r)=>$r['type']===$type&&$r['ref']===$ref));
 handoffOut(['ok'=>true,'destination'=>$found[0]??null,'available'=>isset($found[0])]);
}
if($command==='apply'){
 $token=validToken((string)($argv[2]??''));$type=(string)($argv[3]??'');$ref=(string)($argv[4]??'');$timeout=max(5,min((int)($argv[5]??20),120));
 $found=array_values(array_filter(targets($db),fn($r)=>$r['type']===$type&&$r['ref']===$ref));if(!$found)handoffOut(['ok'=>false,'code'=>'destination_unavailable'],1);$target=$found[0]['target'];
 $file='/etc/asterisk/extensions_custom.conf';$source=is_file($file)?(string)file_get_contents($file):'';
 $source=preg_replace('/; BEGIN PBXPuls AI Handoff '.preg_quote($token,'/').'.*?; END PBXPuls AI Handoff '.preg_quote($token,'/').'\s*/s','',$source);
 $block="; BEGIN PBXPuls AI Handoff {$token}\n[pbxpuls-ai-handoff]\nexten => {$token},1,NoOp(PBXPuls controlled human handoff)\n same => n,Set(__PBXPULS_HANDOFF_TOKEN={$token})\n same => n,Dial(Local/{$token}@pbxpuls-ai-handoff-target/n,{$timeout})\n same => n,Set(__PBXPULS_HANDOFF_DIALSTATUS=\${DIALSTATUS})\n same => n,GotoIf(\$[\"\${DIALSTATUS}\"=\"ANSWER\"]?completed)\n same => n,Stasis(pbxpuls-ai-control,handoff_return:{$token}:\${DIALSTATUS})\n same => n,Hangup()\n same => n(completed),Stasis(pbxpuls-ai-control,handoff_complete:{$token}:ANSWER)\n same => n,Hangup()\n\n[pbxpuls-ai-handoff-target]\nexten => {$token},1,Goto({$target})\n; END PBXPuls AI Handoff {$token}\n";
 $tmp=$file.'.pbxpuls-handoff.tmp';if(file_put_contents($tmp,rtrim((string)$source)."\n\n".$block,LOCK_EX)===false)handoffOut(['ok'=>false,'code'=>'dialplan_write_failed'],1);
 if(!chown($tmp,'asterisk')||!chgrp($tmp,'asterisk')||!chmod($tmp,0664)||!rename($tmp,$file))handoffOut(['ok'=>false,'code'=>'dialplan_permissions_failed'],1);
 handoffOut(['ok'=>true,'token'=>$token,'target'=>$target,'destination'=>$found[0]]);
}
handoffOut(['ok'=>false,'code'=>'unsupported_command'],1);
