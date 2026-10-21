<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
require __DIR__ . '/smtp.php';
try {
    $c = hc_config();
    $db = hc_db($c);
    if ((int)$db->query("SELECT GET_LOCK('hc_capital_mail_worker',0)")->fetchColumn() !== 1) exit;
    try {
        $rows = $db->query('SELECT * FROM hc_requests WHERE mail_sent_at IS NULL AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY created_at LIMIT 10')->fetchAll();
        foreach ($rows as $r) {
            $body = "Заявка: {$r['id']}\nДата (UTC): {$r['created_at']}\nИмя: {$r['name']}\nТелефон: {$r['phone']}\nКомпания: {$r['company']}\nДолжность: {$r['position']}\nФормат: {$r['package_name']}\n\nСообщение:\n{$r['message']}\n\nСогласие: предоставлено\nРедакция: {$r['consent_version']}\nSHA-256: {$r['consent_sha256']}\n";
            try {
                hc_smtp($c['smtp'], $body, $r['id']);
                $q=$db->prepare('UPDATE hc_requests SET mail_sent_at=UTC_TIMESTAMP(), mail_attempts=mail_attempts+1 WHERE id=?');
                $q->execute([$r['id']]);
            } catch (Throwable $e) {
                $minutes = min(360, 5 * (2 ** min(6, (int)$r['mail_attempts'])));
                $q=$db->prepare('UPDATE hc_requests SET mail_attempts=mail_attempts+1, next_attempt_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE id=?');
                $q->execute([$minutes,$r['id']]);
                fwrite(STDERR, "Mail delivery failed; queued for retry.\n");
            }
        }
        if (!empty($c['telegram']['enabled'])) {
            $rows=$db->query('SELECT id FROM hc_requests WHERE mail_sent_at IS NOT NULL AND telegram_sent_at IS NULL AND telegram_attempts<5 ORDER BY created_at LIMIT 10')->fetchAll();
            foreach ($rows as $r) {
                $q=$db->prepare('UPDATE hc_requests SET telegram_attempts=telegram_attempts+1 WHERE id=?');
                $q->execute([$r['id']]);
                try {
                    hc_telegram($c['telegram']);
                    $q=$db->prepare('UPDATE hc_requests SET telegram_sent_at=UTC_TIMESTAMP() WHERE id=?');
                    $q->execute([$r['id']]);
                } catch (Throwable $e) { fwrite(STDERR, "Notification failed.\n"); }
            }
        }
        $db->exec('DELETE FROM hc_rate_limits WHERE expires_at<UTC_TIMESTAMP()');
        $pending=(int)$db->query('SELECT COUNT(*) FROM hc_requests WHERE mail_sent_at IS NULL')->fetchColumn();
        echo "Worker complete. Pending mail: $pending\n";
    } finally { $db->query("SELECT RELEASE_LOCK('hc_capital_mail_worker')"); }
} catch (Throwable $e) { fwrite(STDERR, "Worker unavailable. Check private configuration and database.\n"); exit(1); }
