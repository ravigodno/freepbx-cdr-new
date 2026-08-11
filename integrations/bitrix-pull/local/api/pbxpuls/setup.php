<?php
declare(strict_types=1);

$_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__, 3);
require $_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_admin_before.php';
require $_SERVER['DOCUMENT_ROOT'].'/local/php_interface/lib/PbxpulsPairing.php';
global $USER;
if (!$USER || !$USER->IsAdmin()) { http_response_code(403); exit('Administrator access required'); }
$code = ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && check_bitrix_sessid() ? PbxpulsPairing::generateCode() : '';
require $_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_admin_after.php';
?>
<div style="max-width:720px;padding:24px;font-family:Arial,sans-serif">
  <h1>Подключение PBXPuls</h1>
  <p>Одноразовый код действует 10 минут. PBXPuls получит отдельный токен только для чтения результатов веб-форм.</p>
  <?php if ($code): ?><div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:20px;background:#eef5ff;border-radius:12px"><?=htmlspecialchars($code)?></div><?php endif; ?>
  <form method="post" style="margin-top:20px"><?=bitrix_sessid_post()?><button type="submit" style="padding:12px 18px">Создать одноразовый код</button></form>
</div>
<?php require $_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/epilog_admin.php'; ?>
