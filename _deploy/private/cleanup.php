<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
try {
    $db=hc_db(hc_config());
    $n=$db->exec('DELETE FROM hc_requests WHERE retain_for_contract=0 AND last_interaction_at<DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)');
    $db->exec('DELETE FROM hc_rate_limits WHERE expires_at<UTC_TIMESTAMP()');
    echo "Expired non-contract requests removed: $n\n";
} catch (Throwable $e) { fwrite(STDERR, "Cleanup unavailable.\n"); exit(1); }
