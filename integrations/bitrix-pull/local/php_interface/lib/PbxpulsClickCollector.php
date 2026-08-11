<?php
declare(strict_types=1);

use Bitrix\Main\Application;
require_once __DIR__.'/PbxpulsPairing.php';

final class PbxpulsClickCollector
{
    private array $config;
    public function __construct(array $config) { $this->config = $config; }
    public function handle(): void
    {
        header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') $this->fail(405, 'method_not_allowed');
        $raw=(string)file_get_contents('php://input');if(strlen($raw)>16384)$this->fail(413,'payload_too_large');
        $data=json_decode($raw,true);if(!is_array($data)||($data['eventType']??'')!=='phone_click')$this->fail(400,'invalid_payload');
        $siteKey=(string)($this->config['publicSiteKey']??'');if($siteKey==='')$siteKey=PbxpulsPairing::publicSiteKey();if($siteKey===''||!hash_equals($siteKey,(string)($data['siteKey']??'')))$this->fail(403,'invalid_site_key');
        $host=strtolower((string)parse_url((string)($data['pageUrl']??''),PHP_URL_HOST));$allowed=strtolower((string)($this->config['siteHost']??''));if($allowed==='')$allowed=strtolower(preg_replace('/:\d+$/','',(string)($_SERVER['HTTP_HOST']??'')));if($allowed===''||$host!==$allowed)$this->fail(403,'invalid_origin');
        $eventId=substr((string)($data['eventId']??''),0,191);if($eventId==='')$this->fail(400,'event_id_required');$utm=is_array($data['utm']??null)?$data['utm']:[];
        $ip=(string)($_SERVER['REMOTE_ADDR']??'');$salt=(string)($this->config['ipHashSalt']??'');if($salt==='')$salt=PbxpulsPairing::ipHashSalt();$created=$this->date((string)($data['timestamp']??''));$c=Application::getConnection();$h=$c->getSqlHelper();
        $siteId=preg_match('/^[a-zA-Z0-9_-]{1,16}$/',(string)($data['siteId']??''))?(string)$data['siteId']:'';
        $values=[$eventId,$siteId,$created,$data['pageUrl']??'',$data['referrer']??'',$data['phoneText']??'',$data['phoneHref']??'',$data['sessionId']??'',$utm['source']??'',$utm['medium']??'',$utm['campaign']??'',$utm['content']??'',$utm['term']??'',hash('sha256',$salt.':'.$ip),$_SERVER['HTTP_USER_AGENT']??''];
        $limits=[191,16,19,1000,1000,120,160,160,160,160,240,240,240,64,500];
        $escaped=array_map(fn($v,$i)=>"'".$h->forSql(substr((string)$v,0,$limits[$i]))."'",$values,array_keys($values));
        $c->queryExecute("INSERT IGNORE INTO pbxpuls_phone_clicks(event_id,site_id,event_time,page_url,referrer,phone_text,phone_href,session_id,utm_source,utm_medium,utm_campaign,utm_content,utm_term,ip_hash,user_agent) VALUES(".implode(',',$escaped).")");
        echo '{"ok":true}';
    }
    private function date(string $value):string { try{return(new DateTimeImmutable($value))->format('Y-m-d H:i:s');}catch(Throwable $e){return date('Y-m-d H:i:s');} }
    private function fail(int $status,string $code):never {http_response_code($status);echo json_encode(['ok'=>false,'error'=>$code]);exit;}
}
