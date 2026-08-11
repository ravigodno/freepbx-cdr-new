<?php
declare(strict_types=1);

use Bitrix\Main\Application;
use Bitrix\Main\DB\Connection;
require_once __DIR__.'/PbxpulsPairing.php';

final class PbxpulsPullApi
{
    private Connection $connection;
    private array $config;

    public function __construct(array $config)
    {
        $this->connection = Application::getConnection();
        $this->config = $config;
    }

    public function handle(): void
    {
        try {
            $this->guardRequest();
            $action = (string)($_GET['action'] ?? '');
            if ($action === 'forms') {
                $this->json(['sites' => PbxpulsPairing::sites(), 'forms' => $this->forms()]);
                return;
            }
            if ($action === 'leads') {
                $this->json($this->leads());
                return;
            }
            if ($action === 'clicks') {
                $this->json($this->clicks());
                return;
            }
            if ($action === 'tracking-sites') {
                PbxpulsPairing::setTrackingSites(explode(',', (string)($_GET['siteIds'] ?? '')));
                $this->json(['success' => true]);
                return;
            }
            $this->fail(404, 'action_not_found', 'Неизвестное действие');
        } catch (Throwable $error) {
            if (!headers_sent()) {
                $this->fail(500, 'internal_error', 'Внутренняя ошибка');
            }
        }
    }

    private function guardRequest(): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
            $this->fail(405, 'method_not_allowed', 'Разрешён только GET');
        }
        if (empty($_SERVER['HTTPS']) || strtolower((string)$_SERVER['HTTPS']) === 'off') {
            $this->fail(403, 'https_required', 'Требуется HTTPS');
        }
        $expected = strtolower(PbxpulsPairing::tokenHash());
        if (!preg_match('/^[a-f0-9]{64}$/', $expected)) {
            $expected = strtolower((string)($this->config['tokenHash'] ?? ''));
        }
        $token = trim((string)($_SERVER['HTTP_X_PBXPULS_TOKEN'] ?? ''));
        if (!preg_match('/^[a-f0-9]{64}$/', $expected) || $token === '' || !hash_equals($expected, hash('sha256', $token))) {
            $this->fail(401, 'invalid_token', 'Неверный токен');
        }
    }

    private function forms(): array
    {
        $where = $this->formScopeSql('f');
        $sql = "SELECT f.ID,f.SID,f.NAME,COUNT(DISTINCT r.ID) RESULTS_COUNT,
                MAX(CASE WHEN ff.SID='PHONE' THEN 1 ELSE 0 END) HAS_PHONE,
                GROUP_CONCAT(DISTINCT fs.SITE_ID ORDER BY fs.SITE_ID) SITE_IDS
            FROM b_form f
            LEFT JOIN b_form_result r ON r.FORM_ID=f.ID
            LEFT JOIN b_form_field ff ON ff.FORM_ID=f.ID AND ff.ADDITIONAL='N'
            LEFT JOIN b_form_2_site fs ON fs.FORM_ID=f.ID
            WHERE {$where}
            GROUP BY f.ID,f.SID,f.NAME ORDER BY f.C_SORT,f.ID";
        $items = [];
        $result = $this->connection->query($sql);
        while ($row = $result->fetch()) {
            $items[] = ['id' => (string)$row['ID'], 'code' => (string)$row['SID'], 'name' => (string)$row['NAME'],
                'hasPhone' => (bool)$row['HAS_PHONE'], 'resultsCount' => (int)$row['RESULTS_COUNT'],
                'siteIds' => array_values(array_filter(explode(',', (string)$row['SITE_IDS'])))];
        }
        return $items;
    }

    private function leads(): array
    {
        $after = max(0, (int)($_GET['after'] ?? 0));
        $maximum = max(1, min(100, (int)($this->config['maximumLimit'] ?? 100)));
        $limit = max(1, min($maximum, (int)($_GET['limit'] ?? 100)));
        $requested = $this->integerList((string)($_GET['formIds'] ?? ''));
        if (!$requested) {
            $this->fail(400, 'form_ids_required', 'Выберите формы');
        }
        $allowed = array_column($this->forms(), 'id');
        $formIds = array_values(array_intersect(array_map('strval', $requested), $allowed));
        if (!$formIds) {
            $this->fail(403, 'forms_forbidden', 'Запрошенные формы недоступны');
        }
        $ids = implode(',', array_map('intval', $formIds));
        $rows = $this->connection->query("SELECT r.ID,r.FORM_ID,r.DATE_CREATE,f.SID FORM_CODE,f.NAME FORM_NAME,
            (SELECT GROUP_CONCAT(DISTINCT fs.SITE_ID ORDER BY fs.SITE_ID) FROM b_form_2_site fs WHERE fs.FORM_ID=r.FORM_ID) SITE_IDS
            FROM b_form_result r JOIN b_form f ON f.ID=r.FORM_ID
            WHERE r.ID>".$after." AND r.FORM_ID IN(".$ids.") ORDER BY r.ID ASC LIMIT ".$limit);
        $items = [];
        $lastId = $after;
        while ($row = $rows->fetch()) {
            $lastId = max($lastId, (int)$row['ID']);
            $fields = $this->resultFields((int)$row['ID']);
            $phone = $fields['PHONE'] ?? null;
            if (!is_string($phone) || trim($phone) === '') {
                continue;
            }
            $siteIds=array_values(array_filter(explode(',',(string)$row['SITE_IDS'])));
            $items[] = ['eventId' => 'bitrix-form-'.$row['FORM_ID'].'-result-'.$row['ID'], 'formId' => (string)$row['FORM_ID'], 'siteId' => count($siteIds)===1?$siteIds[0]:null, 'siteIds'=>$siteIds,
                'resultId' => (string)$row['ID'], 'formCode' => (string)$row['FORM_CODE'], 'formName' => (string)$row['FORM_NAME'],
                'createdAt' => (new DateTimeImmutable((string)$row['DATE_CREATE']))->format(DateTimeInterface::ATOM),
                'fields' => ['name' => $fields['NAME'] ?? $fields['FIO'] ?? null, 'phone' => $phone, 'email' => $fields['EMAIL'] ?? null,
                    'company' => $fields['COMPANY'] ?? null, 'comment' => $fields['MESSAGE'] ?? null], 'rawFields' => $fields];
        }
        return ['items' => $items, 'nextCursor' => (string)$lastId, 'hasMore' => count($items) >= $limit];
    }

    private function resultFields(int $resultId): array
    {
        $fields = [];
        $rows = $this->connection->query("SELECT ff.SID,ra.USER_TEXT,ra.ANSWER_TEXT,ra.ANSWER_VALUE
            FROM b_form_result_answer ra JOIN b_form_field ff ON ff.ID=ra.FIELD_ID
            WHERE ra.RESULT_ID=".$resultId." AND ff.ADDITIONAL='N' ORDER BY ra.ID");
        while ($row = $rows->fetch()) {
            $code = strtoupper((string)$row['SID']);
            if ($code === '' || in_array($code, ['FILE','FILES','SESSION_ID','STAFF_EMAIL_HIDDEN'], true)) continue;
            $value = trim((string)($row['USER_TEXT'] ?: $row['ANSWER_TEXT'] ?: $row['ANSWER_VALUE']));
            if ($value === '') continue;
            $fields[$code] = isset($fields[$code]) ? $fields[$code]."\n".$value : $value;
        }
        return $fields;
    }

    private function clicks(): array
    {
        $after=max(0,(int)($_GET['after']??0));$limit=max(1,min(100,(int)($_GET['limit']??100)));
        $rows=$this->connection->query("SELECT * FROM pbxpuls_phone_clicks WHERE id>".$after." ORDER BY id ASC LIMIT ".$limit);$items=[];$lastId=$after;
        while($row=$rows->fetch()){$lastId=max($lastId,(int)$row['id']);$items[]=['id'=>(string)$row['id'],'eventId'=>(string)$row['event_id'],'siteId'=>(string)($row['site_id']??''),'eventType'=>'phone_click','eventTime'=>(new DateTimeImmutable((string)$row['event_time']))->format(DateTimeInterface::ATOM),'pageUrl'=>(string)$row['page_url'],'referrer'=>(string)$row['referrer'],'phoneText'=>(string)$row['phone_text'],'phoneHref'=>(string)$row['phone_href'],'sessionId'=>(string)$row['session_id'],'utm'=>['source'=>(string)$row['utm_source'],'medium'=>(string)$row['utm_medium'],'campaign'=>(string)$row['utm_campaign'],'content'=>(string)$row['utm_content'],'term'=>(string)$row['utm_term']],'ipHash'=>(string)$row['ip_hash'],'userAgent'=>(string)$row['user_agent']];}
        return['items'=>$items,'nextCursor'=>(string)$lastId,'hasMore'=>count($items)>=$limit];
    }

    private function formScopeSql(string $alias): string
    {
        $allowed = array_values(array_filter(array_map('intval', (array)($this->config['allowedFormIds'] ?? []))));
        if ($allowed) return $alias.'.ID IN('.implode(',', $allowed).')';
        $siteId = (string)($_GET['siteId'] ?? '');
        if (preg_match('/^[a-zA-Z0-9_-]{1,16}$/', $siteId)) return "EXISTS(SELECT 1 FROM b_form_2_site pfs WHERE pfs.FORM_ID=".$alias.".ID AND pfs.SITE_ID='".$this->connection->getSqlHelper()->forSql($siteId)."')";
        if (preg_match('/^[a-f0-9]{64}$/', PbxpulsPairing::tokenHash())) return '1=1';
        $suffix = (string)($this->config['siteSuffix'] ?? '_s1');
        return $alias.".SID LIKE '%".$this->connection->getSqlHelper()->forSql($suffix)."'";
    }

    private function integerList(string $value): array
    {
        return array_values(array_unique(array_filter(array_map('intval', preg_split('/[,\s]+/', $value) ?: []))));
    }

    private function json(array $payload): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    private function fail(int $status, string $code, string $message): never
    {
        http_response_code($status);
        $this->json(['success' => false, 'code' => $code, 'error' => $message]);
        exit;
    }
}
