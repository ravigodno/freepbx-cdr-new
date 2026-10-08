<?php
declare(strict_types=1);
// Use the installed Webrtc module; never edit generated Asterisk configuration.
ini_set('display_errors', '0');
ob_start();
function result(array $data, int $status = 0): void {
    ob_end_clean();
    echo json_encode($data, JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit($status);
}
try {
    $bootstrap_settings['skip_astman'] = false;
    require_once '/etc/freepbx.conf';
    $command = (string)($argv[1] ?? 'inspect');
    $extension = (string)($argv[2] ?? '');
    if (!in_array($command, ['inspect', 'apply', 'rollback'], true) || !preg_match('/^[0-9]{1,8}$/', $extension)) throw new RuntimeException('invalid_request');
    $device = '99'.$extension;
    $core = \FreePBX::Core();
    $webrtc = \FreePBX::Webrtc();
    $db = \FreePBX::Database();
    $lock = $db->prepare('SELECT GET_LOCK(?, 5)');
    $lock->execute(['pbxpuls-webrtc-'.$extension]);
    if ((int)$lock->fetchColumn() !== 1) throw new RuntimeException('device_busy');
    $inspect = function () use ($core, $webrtc, $db, $extension, $device, $astman): array {
        // Core::getUser can write AstDB defaults; preview reads identity directly.
        $users = $db->prepare('SELECT * FROM users WHERE extension=?');
        $users->execute([$extension]);
        $user = $users->fetch(\PDO::FETCH_ASSOC) ?: [];
        $primary = $core->getDevice($extension);
        $companion = $core->getDevice($device);
        $cert = \FreePBX::Certman()->getDefaultCertDetails();
        $query = $db->prepare('SELECT user,device,prefix,module FROM webrtc_clients WHERE device=?');
        $query->execute([$device]);
        $mapping = $query->fetch(\PDO::FETCH_ASSOC) ?: [];
        $owned = !empty($companion) && (string)($mapping['user'] ?? '') === $extension
            && (string)($mapping['prefix'] ?? '') === '99' && (string)($companion['user'] ?? '') === $extension;
        $users->execute([$device]);
        $conflict = (bool)$users->fetch(\PDO::FETCH_ASSOC) || (!empty($companion) && !$owned) || (empty($companion) && !empty($mapping));
        $checks = [];
        if (empty($user) || empty($primary)) $checks[] = 'extension_missing';
        if (($primary['tech'] ?? '') !== 'pjsip') $checks[] = 'pjsip_required';
        if (!$astman->connected()) $checks[] = 'freepbx_ami_unavailable';
        elseif ($webrtc->getSocketMode() !== 'pjsip') $checks[] = 'pjsip_websocket_missing';
        if (empty($cert)) $checks[] = 'default_certificate_missing';
        if ($conflict) $checks[] = 'companion_number_conflict';
        if ($owned && (($companion['webrtc'] ?? '') !== 'yes' || ($companion['media_encryption'] ?? '') !== 'dtls')) $checks[] = 'existing_companion_not_webrtc';
        // Include secrets only inside the hash, never in preview output.
        $digest = hash('sha256', serialize([$user, $primary, $companion, $mapping, $cert]));
        return ['ok' => true, 'ready' => count($checks) === 0, 'extension' => $extension, 'device' => $device,
            'exists' => $owned, 'checks' => $checks, 'digest' => $digest, 'module' => $mapping['module'] ?? null];
    };
    $before = $inspect();
    if ($command === 'inspect') result($before);
    $expected = (string)($argv[3] ?? '');
    if (!hash_equals($before['digest'], $expected)) throw new RuntimeException('preview_stale');
    if ($command === 'rollback') {
        if (!$before['exists'] || $before['module'] !== 'PBXPuls') throw new RuntimeException('rollback_ownership_changed');
        $webrtc->removeDevice($extension, '99');
        $remaining = $db->prepare('SELECT id FROM devices WHERE id=?');
        $remaining->execute([$device]);
        if ($remaining->fetchColumn()) throw new RuntimeException('rollback_not_verified');
        result(['ok' => true, 'removed' => $device]);
    }
    if (!$before['ready']) throw new RuntimeException('preflight_failed');
    $created = false;
    try {
        if (!$before['exists']) {
            $created = true;
            if (!$webrtc->createDevice($extension, '', '99', 'PBXPuls')) throw new RuntimeException('device_creation_failed');
        }
        $after = $inspect();
        if (!$after['ready'] || !$after['exists']) throw new RuntimeException('device_verification_failed');
        $dev = $core->getDevice($device);
        if (empty($dev['secret'])) throw new RuntimeException('device_secret_missing');
        // The apply response is consumed only by the backend and encrypted for SQL storage.
        result($after + ['created' => $created, 'secret' => $dev['secret']]);
    } catch (Throwable $e) {
        if ($created) $webrtc->removeDevice($extension, '99');
        throw $e;
    }
} catch (Throwable $e) {
    $allowed = ['invalid_request','device_busy','preview_stale','rollback_ownership_changed','rollback_not_verified','preflight_failed','device_creation_failed','device_verification_failed','device_secret_missing'];
    result(['ok' => false, 'code' => in_array($e->getMessage(), $allowed, true) ? $e->getMessage() : 'freepbx_webrtc_unavailable'], 1);
}
