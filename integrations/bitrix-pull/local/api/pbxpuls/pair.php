<?php
declare(strict_types=1);

define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);

$_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__, 3);
require $_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_before.php';
require $_SERVER['DOCUMENT_ROOT'].'/local/php_interface/lib/PbxpulsPairing.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (empty($_SERVER['HTTPS']) || strtolower((string)$_SERVER['HTTPS']) === 'off') {
    http_response_code(403); echo json_encode(['success' => false, 'code' => 'https_required']); exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    echo json_encode(['success' => true, 'platform' => 'bitrix', 'connector' => 'pbxpuls', 'pairingVersion' => 1]); exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405); echo json_encode(['success' => false, 'code' => 'method_not_allowed']); exit;
}
$input = json_decode((string)file_get_contents('php://input'), true);
try {
    require_once $_SERVER['DOCUMENT_ROOT'].'/local/php_interface/lib/PbxpulsTrackerInjector.php';
    $result = PbxpulsPairing::exchange(trim((string)($input['code'] ?? '')));
    echo json_encode(['success' => true] + $result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(401); echo json_encode(['success' => false, 'code' => 'pairing_code_invalid', 'error' => 'Код недействителен или истёк']);
}
