<?php
declare(strict_types=1);

require_once '/etc/freepbx.conf';

function fail(string $code, string $message): void {
    echo json_encode(['ok' => false, 'code' => $code, 'message' => $message], JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit(1);
}
function extensionArg(array $argv): string {
    $extension = (string)($argv[2] ?? '');
    if (!preg_match('/^[0-9]{2,8}$/', $extension)) fail('invalid_extension', 'Invalid extension');
    return $extension;
}
function safeText($value, int $max = 191): string {
    return mb_substr(trim(strip_tags((string)$value)), 0, $max);
}
function conflicts($db, string $extension): array {
    $checks = [
        ['extension', 'users', 'extension', 'name'],
        ['ring_group', 'ringgroups', 'grpnum', 'description'],
        ['queue', 'queues_config', 'extension', 'descr'],
        ['conference', 'meetme', 'exten', 'description'],
        ['paging', 'paging_config', 'page_group', 'description'],
        ['misc_application', 'miscapps', 'ext', 'description'],
        ['custom_extension', 'custom_extensions', 'custom_exten', 'description'],
    ];
    $found = [];
    foreach ($checks as [$type, $table, $column, $label]) {
        try {
            $statement = $db->prepare("SELECT `$label` label FROM `$table` WHERE `$column`=? LIMIT 1");
            $statement->execute([$extension]);
            if ($row = $statement->fetch())
                $found[] = ['type' => $type, 'name' => safeText($row['label'] ?? $extension)];
        } catch (Throwable $ignored) {}
    }
    $feature = $db->prepare("SELECT description FROM featurecodes WHERE enabled=1 AND (defaultcode=? OR customcode=?) LIMIT 1");
    $feature->execute([$extension, $extension]);
    if ($row = $feature->fetch())
        $found[] = ['type' => 'feature_code', 'name' => safeText($row['description'] ?? $extension)];
    return $found;
}
function dependencies($db, string $target): array {
    $checks = [
        ['inbound_route', 'incoming', 'destination', 'description'],
        ['ivr', 'ivr_entries', 'dest', 'selection'],
        ['time_condition_true', 'timeconditions', 'truegoto', 'displayname'],
        ['time_condition_false', 'timeconditions', 'falsegoto', 'displayname'],
        ['ring_group', 'ringgroups', 'postdest', 'description'],
        ['queue', 'queues_config', 'dest', 'descr'],
    ];
    $found = [];
    foreach ($checks as [$type, $table, $column, $label]) {
        try {
            $statement = $db->prepare("SELECT `$label` label FROM `$table` WHERE `$column`=?");
            $statement->execute([$target]);
            foreach ($statement->fetchAll() as $row)
                $found[] = ['type' => $type, 'name' => safeText($row['label'] ?? $type)];
        } catch (Throwable $ignored) {}
    }
    return $found;
}
function customBlock(string $extension, string $fallbackTarget): string {
    $fallback = $fallbackTarget === 'hangup'
        ? 'Hangup(38)'
        : 'Goto(' . $fallbackTarget . ')';
    return "; BEGIN PBXPuls AI Extension {$extension}\n[pbxpuls-ai]\nexten => {$extension},1,NoOp(PBXPuls managed AI Extension {$extension})\n same => n,Set(__PBXPULS_AI_EXTENSION={$extension})\n same => n,Set(__PBXPULS_AI_FALLBACK_DEPTH=\${IF(\$[\"\${PBXPULS_AI_FALLBACK_DEPTH}\"=\"\"]?0:\${PBXPULS_AI_FALLBACK_DEPTH})})\n same => n,GotoIf(\$[\${PBXPULS_AI_FALLBACK_DEPTH}>=2]?fallback_loop)\n same => n,Stasis(pbxpuls-ai-control,ai_extension:{$extension})\n same => n,Set(__PBXPULS_AI_FALLBACK_DEPTH=\$[\${PBXPULS_AI_FALLBACK_DEPTH}+1])\n same => n,{$fallback}\n same => n(fallback_loop),Hangup(25)\n; END PBXPuls AI Extension {$extension}\n";
}

$command = (string)($argv[1] ?? '');
$extension = extensionArg($argv);
$db = \FreePBX::Database()->getDoctrineConnection();
$contextFile = '/etc/asterisk/extensions_custom.conf';
$destination = "pbxpuls-ai,{$extension},1";

if ($command === 'inspect') {
    $custom = \FreePBX::Customappsreg()->getAllCustomDests();
    $customMatch = array_values(array_filter($custom, fn($row) => (string)($row['target'] ?? '') === $destination));
    $misc = $db->prepare("SELECT miscapps_id,description,dest FROM miscapps WHERE ext=?");
    $misc->execute([$extension]);
    $dialplan = is_file($contextFile) ? (string)file_get_contents($contextFile) : '';
    $fileStat = is_file($contextFile) ? stat($contextFile) : false;
    $owner = $fileStat && function_exists('posix_getpwuid') ? posix_getpwuid((int)$fileStat['uid']) : false;
    $group = $fileStat && function_exists('posix_getgrgid') ? posix_getgrgid((int)$fileStat['gid']) : false;
    $withoutLegacy = preg_replace('/; BEGIN PBXPuls AI Voice Test.*?; END PBXPuls AI Voice Test\s*/s', '', $dialplan);
    $withoutManaged = preg_replace('/; BEGIN PBXpuls AI Extension '.preg_quote($extension, '/').'.*?; END PBXPuls AI Extension '.preg_quote($extension, '/').'\s*/is', '', (string)$withoutLegacy);
    $planned = rtrim((string)$withoutManaged) . "\n\n" . customBlock($extension, 'hangup');
    preg_match_all('/^\[([^\]]+)\]\s*$/m', (string)$withoutManaged, $preservedContexts);
    echo json_encode([
        'ok' => true,
        'extension' => $extension,
        'conflicts' => conflicts($db, $extension),
        'customDestination' => $customMatch,
        'miscApplication' => $misc->fetchAll(),
        'legacyRoutePresent' => strpos($dialplan, "exten => {$extension},1,Gosub(pbxpuls-ai-voice-test") !== false,
        'managedBlockPresent' => strpos($dialplan, "BEGIN PBXPuls AI Extension {$extension}") !== false,
        'dependencies' => dependencies($db, $destination),
        'dialplanFile' => [
            'path' => $contextFile,
            'owner' => $owner['name'] ?? (string)($fileStat['uid'] ?? ''),
            'group' => $group['name'] ?? (string)($fileStat['gid'] ?? ''),
            'mode' => $fileStat ? substr(sprintf('%o', $fileStat['mode']), -4) : null,
            'includedBy' => '/etc/asterisk/extensions.conf',
        ],
        'plannedDialplan' => [
            'atomicWrite' => true,
            'owner' => 'asterisk',
            'group' => 'asterisk',
            'mode' => '0664',
            'context' => 'pbxpuls-ai',
            'extension' => $extension,
            'legacyRoutePresent' => strpos($planned, 'pbxpuls-ai-voice-test') !== false,
            'preservedCustomContexts' => array_values(array_unique($preservedContexts[1] ?? [])),
        ],
    ], JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit;
}
if ($command === 'apply') {
    $displayName = safeText($argv[3] ?? "AI {$extension}", 50);
    $fallbackTarget = (string)($argv[4] ?? 'hangup');
    if ($fallbackTarget !== 'hangup' && !preg_match('/^[a-z0-9_-]{2,64},[0-9A-Za-z*#+.-]{1,80},1$/', $fallbackTarget))
        fail('invalid_fallback', 'Invalid fallback target');
    $customapps = \FreePBX::Customappsreg();
    $all = $customapps->getAllCustomDests();
    $destId = null;
    foreach ($all as $id => $row) if ((string)($row['target'] ?? '') === $destination) $destId = (int)$id;
    $managedMisc = $db->prepare("SELECT miscapps_id FROM miscapps WHERE ext=? AND dest=? LIMIT 1");
    $managedMisc->execute([$extension, $destination]);
    $managedObjectsExist = $destId && (int)($managedMisc->fetchColumn() ?: 0) > 0;
    $existingConflicts = array_values(array_filter(
        conflicts($db, $extension),
        fn($row) => !$managedObjectsExist || !in_array($row['type'], ['misc_application', 'feature_code'], true)
    ));
    if ($existingConflicts) fail('extension_conflict', 'Extension is already used');
    if (!$destId) {
        $destId = (int)($customapps->getConfig('currentid') ?: 1);
        $customapps->setConfig($destId, ['destid'=>$destId,'target'=>$destination,'description'=>"AI: {$displayName} ({$extension})",'notes'=>'Виртуальный внутренний номер управляется PBXPuls. SIP-регистрация не требуется.','destret'=>false,'dest'=>''], 'dests');
        $customapps->setConfig('currentid', $destId + 1);
    }
    $misc = $db->prepare("SELECT miscapps_id FROM miscapps WHERE ext=? LIMIT 1");
    $misc->execute([$extension]);
    $miscId = (int)($misc->fetchColumn() ?: 0);
    if (!$miscId) $miscId = (int)\FreePBX::Miscapps()->add("{$displayName} — PBXPuls", $extension, $destination);
    $source = is_file($contextFile) ? (string)file_get_contents($contextFile) : '';
    $source = preg_replace('/; BEGIN PBXPuls AI Voice Test.*?; END PBXPuls AI Voice Test\s*/s', '', $source);
    $source = preg_replace('/; BEGIN PBXPuls AI Extension '.preg_quote($extension, '/').'.*?; END PBXPuls AI Extension '.preg_quote($extension, '/').'\s*/s', '', $source);
    $updated = rtrim((string)$source) . "\n\n" . customBlock($extension, $fallbackTarget);
    $temporary = $contextFile . '.pbxpuls.tmp';
    if (file_put_contents($temporary, $updated, LOCK_EX) === false) fail('dialplan_write_failed', 'Cannot write dialplan');
    if (!chown($temporary, 'asterisk') || !chgrp($temporary, 'asterisk') || !chmod($temporary, 0664))
        fail('dialplan_permissions_failed', 'Cannot set supported Asterisk file ownership');
    if (!rename($temporary, $contextFile)) fail('dialplan_write_failed', 'Cannot activate dialplan file');
    echo json_encode(['ok'=>true,'extension'=>$extension,'miscApplicationId'=>$miscId,'customDestinationId'=>$destId,'destination'=>$destination], JSON_UNESCAPED_UNICODE), PHP_EOL;
    exit;
}
fail('unsupported_command', 'Unsupported command');
