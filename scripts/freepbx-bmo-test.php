<?php

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

function emitJson(array $payload, int $status = 0): void
{
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;
    exit($status);
}

try {
    require_once '/etc/freepbx.conf';

    if (!class_exists('FreePBX')) {
        throw new RuntimeException('FreePBX class is not available after bootstrap.');
    }

    $freepbx = FreePBX::Create();

    $moduleNames = ['core', 'userman', 'findmefollow', 'callwaiting', 'voicemail'];
    $modulesLoaded = [];

    foreach ($moduleNames as $moduleName) {
        $hasModule = false;
        if (isset($freepbx->Modules) && method_exists($freepbx->Modules, 'checkStatus')) {
            $hasModule = (bool) $freepbx->Modules->checkStatus($moduleName);
        }
        $modulesLoaded[$moduleName] = $hasModule;
    }

    $core = $freepbx->Core;
    if (!is_object($core)) {
        throw new RuntimeException('Core BMO object is not available.');
    }

    $extensionsSample = [];
    if (method_exists($core, 'getAllUsersByDeviceType')) {
        $extensionsSample = $core->getAllUsersByDeviceType();
    }

    $user100 = null;
    if (method_exists($core, 'getUser')) {
        $user100 = $core->getUser('100');
    }

    $device100 = null;
    if (method_exists($core, 'getDevice')) {
        $device100 = $core->getDevice('100');
    }

    emitJson([
        'success' => true,
        'modulesLoaded' => $modulesLoaded,
        'extensionsSample' => $extensionsSample,
        'user100' => $user100,
        'device100' => $device100,
    ]);
} catch (Throwable $e) {
    fwrite(STDERR, $e->getMessage() . PHP_EOL);
    emitJson([
        'success' => false,
        'error' => $e->getMessage(),
    ], 1);
}
