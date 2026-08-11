<?php
declare(strict_types=1);

use Bitrix\Main\Config\Option;

final class PbxpulsTrackerInjector
{
    public static function inject(string &$content): void
    {
        if (defined('ADMIN_SECTION') && ADMIN_SECTION === true) return;
        if (PHP_SAPI === 'cli' || stripos($content, '</body>') === false) return;
        $contentType = '';
        foreach (headers_list() as $header) if (stripos($header, 'Content-Type:') === 0) $contentType = strtolower($header);
        if ($contentType !== '' && strpos($contentType, 'text/html') === false) return;
        $siteId = defined('SITE_ID') ? (string)SITE_ID : '';
        $enabled = array_filter(explode(',', Option::get('main', 'pbxpuls_tracking_site_ids', '')));
        if (!$enabled || !in_array($siteId, $enabled, true)) return;
        $key = Option::get('main', 'pbxpuls_public_site_key', '');
        if ($key === '' || strpos($content, 'data-pbxpuls-tracker') !== false) return;
        $tag = '<script defer data-pbxpuls-tracker="1" data-site-key="'.htmlspecialchars($key, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'" src="/local/api/pbxpuls/tracker.js"></script>';
        $content = preg_replace('/<\/body>/i', $tag.'</body>', $content, 1) ?? $content;
    }
}
