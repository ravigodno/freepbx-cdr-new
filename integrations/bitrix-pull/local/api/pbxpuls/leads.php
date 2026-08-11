<?php
declare(strict_types=1);

define('NO_KEEP_STATISTIC', true);
define('NO_AGENT_STATISTIC', true);
define('NOT_CHECK_PERMISSIONS', true);

$_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__, 3);
require $_SERVER['DOCUMENT_ROOT'].'/bitrix/modules/main/include/prolog_before.php';
require $_SERVER['DOCUMENT_ROOT'].'/local/php_interface/lib/PbxpulsPullApi.php';

$configPath = dirname($_SERVER['DOCUMENT_ROOT'], 2).'/.pbxpuls-pull-config.php';
$config = is_file($configPath) ? require $configPath : [];

(new PbxpulsPullApi($config))->handle();
