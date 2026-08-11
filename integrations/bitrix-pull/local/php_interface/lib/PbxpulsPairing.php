<?php
declare(strict_types=1);

use Bitrix\Main\Config\Option;

final class PbxpulsPairing
{
    private const OPTION_MODULE = 'main';
    private const CODE_HASH = 'pbxpuls_pair_code_hash';
    private const CODE_EXPIRES = 'pbxpuls_pair_code_expires';
    private const TOKEN_HASH = 'pbxpuls_api_token_hash';
    private const PUBLIC_SITE_KEY = 'pbxpuls_public_site_key';
    private const IP_HASH_SALT = 'pbxpuls_ip_hash_salt';
    private const PAIR_ATTEMPTS = 'pbxpuls_pair_attempts';

    public static function generateCode(): string
    {
        $code = (string)random_int(10000000, 99999999);
        Option::set(self::OPTION_MODULE, self::CODE_HASH, hash('sha256', $code));
        Option::set(self::OPTION_MODULE, self::CODE_EXPIRES, (string)(time() + 600));
        Option::set(self::OPTION_MODULE, self::PAIR_ATTEMPTS, '0');
        return $code;
    }

    public static function exchange(string $code): array
    {
        $expected = Option::get(self::OPTION_MODULE, self::CODE_HASH, '');
        $expires = (int)Option::get(self::OPTION_MODULE, self::CODE_EXPIRES, '0');
        $attempts = (int)Option::get(self::OPTION_MODULE, self::PAIR_ATTEMPTS, '0');
        if ($attempts >= 10) throw new RuntimeException('pairing_attempts_exceeded');
        Option::set(self::OPTION_MODULE, self::PAIR_ATTEMPTS, (string)($attempts + 1));
        if (!preg_match('/^\d{8}$/', $code) || $expires < time() || !preg_match('/^[a-f0-9]{64}$/', $expected) || !hash_equals($expected, hash('sha256', $code))) {
            throw new RuntimeException('pairing_code_invalid');
        }
        Option::delete(self::OPTION_MODULE, ['name' => self::CODE_HASH]);
        Option::delete(self::OPTION_MODULE, ['name' => self::CODE_EXPIRES]);
        Option::delete(self::OPTION_MODULE, ['name' => self::PAIR_ATTEMPTS]);
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        Option::set(self::OPTION_MODULE, self::TOKEN_HASH, hash('sha256', $token));
        $publicSiteKey = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
        Option::set(self::OPTION_MODULE, self::PUBLIC_SITE_KEY, $publicSiteKey);
        Option::set(self::OPTION_MODULE, self::IP_HASH_SALT, bin2hex(random_bytes(24)));
        self::ensureClickTable();
        self::ensureTrackerHandler();
        return ['token' => $token, 'sites' => self::sites(), 'forms' => self::forms(), 'tracking' => [
            'publicSiteKey' => $publicSiteKey, 'scriptPath' => '/local/api/pbxpuls/tracker.js', 'eventPath' => '/local/api/pbxpuls/event.php'
        ]];
    }

    public static function tokenHash(): string
    {
        return Option::get(self::OPTION_MODULE, self::TOKEN_HASH, '');
    }

    public static function publicSiteKey(): string { return Option::get(self::OPTION_MODULE, self::PUBLIC_SITE_KEY, ''); }
    public static function ipHashSalt(): string { return Option::get(self::OPTION_MODULE, self::IP_HASH_SALT, ''); }
    public static function setTrackingSites(array $siteIds): void
    {
        $safe = array_values(array_unique(array_filter(array_map(fn($id) => preg_match('/^[a-zA-Z0-9_-]{1,16}$/', (string)$id) ? (string)$id : '', $siteIds))));
        Option::set(self::OPTION_MODULE, 'pbxpuls_tracking_site_ids', implode(',', $safe));
    }

    private static function ensureTrackerHandler(): void
    {
        if (Option::get(self::OPTION_MODULE, 'pbxpuls_tracker_handler_registered', 'N') === 'Y') return;
        RegisterModuleDependences('main', 'OnEndBufferContent', 'main', 'PbxpulsTrackerInjector', 'inject', 100, '/local/php_interface/lib/PbxpulsTrackerInjector.php');
        Option::set(self::OPTION_MODULE, 'pbxpuls_tracker_handler_registered', 'Y');
    }

    private static function ensureClickTable(): void
    {
        Bitrix\Main\Application::getConnection()->queryExecute("CREATE TABLE IF NOT EXISTS pbxpuls_phone_clicks (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,event_id VARCHAR(191) NOT NULL,site_id VARCHAR(16) NOT NULL DEFAULT '',event_time DATETIME NOT NULL,
            page_url VARCHAR(1000) NOT NULL DEFAULT '',referrer VARCHAR(1000) NOT NULL DEFAULT '',phone_text VARCHAR(120) NOT NULL DEFAULT '',
            phone_href VARCHAR(160) NOT NULL DEFAULT '',session_id VARCHAR(191) NOT NULL DEFAULT '',utm_source VARCHAR(191) NOT NULL DEFAULT '',
            utm_medium VARCHAR(191) NOT NULL DEFAULT '',utm_campaign VARCHAR(255) NOT NULL DEFAULT '',utm_content VARCHAR(255) NOT NULL DEFAULT '',
            utm_term VARCHAR(255) NOT NULL DEFAULT '',ip_hash CHAR(64) NOT NULL DEFAULT '',user_agent VARCHAR(500) NOT NULL DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE KEY uniq_pbxpuls_click_event(event_id),KEY idx_pbxpuls_click_cursor(id,event_time),KEY idx_pbxpuls_click_site(site_id,id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $columns = Bitrix\Main\Application::getConnection()->getTableFields('pbxpuls_phone_clicks');
        if (!isset($columns['SITE_ID']) && !isset($columns['site_id'])) Bitrix\Main\Application::getConnection()->queryExecute("ALTER TABLE pbxpuls_phone_clicks ADD COLUMN site_id VARCHAR(16) NOT NULL DEFAULT '' AFTER event_id, ADD KEY idx_pbxpuls_click_site(site_id,id)");
    }

    public static function sites(): array
    {
        $items = [];
        $result = CSite::GetList($by = 'sort', $order = 'asc', ['ACTIVE' => 'Y']);
        while ($site = $result->Fetch()) {
            $items[] = ['id' => (string)$site['ID'], 'name' => (string)$site['NAME'], 'domain' => (string)($site['SERVER_NAME'] ?? ''), 'directory' => (string)($site['DIR'] ?? '/')];
        }
        return $items;
    }

    public static function forms(): array
    {
        $connection = Bitrix\Main\Application::getConnection();
        $items = [];
        $rows = $connection->query("SELECT f.ID,f.SID,f.NAME,COUNT(DISTINCT r.ID) RESULTS_COUNT,
            MAX(CASE WHEN ff.SID='PHONE' THEN 1 ELSE 0 END) HAS_PHONE,GROUP_CONCAT(DISTINCT fs.SITE_ID ORDER BY fs.SITE_ID) SITE_IDS
            FROM b_form f LEFT JOIN b_form_result r ON r.FORM_ID=f.ID
            LEFT JOIN b_form_field ff ON ff.FORM_ID=f.ID AND ff.ADDITIONAL='N'
            LEFT JOIN b_form_2_site fs ON fs.FORM_ID=f.ID
            GROUP BY f.ID,f.SID,f.NAME ORDER BY f.C_SORT,f.ID");
        while ($row = $rows->fetch()) {
            $items[] = ['id' => (string)$row['ID'], 'code' => (string)$row['SID'], 'name' => (string)$row['NAME'],
                'hasPhone' => (bool)$row['HAS_PHONE'], 'resultsCount' => (int)$row['RESULTS_COUNT'],
                'siteIds' => array_values(array_filter(explode(',', (string)$row['SITE_IDS'])))];
        }
        return $items;
    }
}
