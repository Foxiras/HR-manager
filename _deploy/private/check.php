<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/smtp.php';
try {
    foreach (['pdo_mysql','mbstring','openssl'] as $ext) {
        if (!extension_loaded($ext)) throw new RuntimeException('PHP extension missing: ' . $ext);
    }
    $c=hc_config(); $db=hc_db($c);
    $db->query('SELECT consent_sha256, next_attempt_at FROM hc_requests LIMIT 1');
    $db->query('SELECT bucket FROM hc_rate_limits LIMIT 1');
    if (!is_file(__DIR__.'/consent/'.HC_CONSENT_VERSION.'.txt')) throw new RuntimeException('Consent file missing');
    echo "Configuration, extensions, database and consent snapshot: OK\n";
    if (in_array('--send-test', $argv, true)) {
        hc_smtp($c['smtp'], 'Тест доставки с сайта Капитал талантов. Персональных данных нет.', bin2hex(random_bytes(16)));
        echo "SMTP accepted test email. Check inbox AND spam before enabling form.\n";
    }
    echo 'Form enabled: ' . (!empty($c['enabled']) ? 'yes' : 'no') . "\n";
} catch (Throwable $e) { fwrite(STDERR, "Check failed: " . ($e instanceof PDOException ? 'database connection/schema' : $e->getMessage()) . "\n"); exit(1); }
