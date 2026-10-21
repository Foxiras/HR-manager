<?php
declare(strict_types=1);

const HC_CONSENT_VERSION = '2026-10-21';

function hc_config(): array {
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) throw new RuntimeException('Configuration missing');
    $c = require $path;
    if (!is_array($c) || strlen($c['rate_secret'] ?? '') < 32
        || in_array('CHANGE_ME', [$c['db']['password'] ?? '', $c['smtp']['password'] ?? ''], true)) {
        throw new RuntimeException('Configuration incomplete');
    }
    return $c;
}

function hc_db(array $c): PDO {
    $db = $c['db'];
    $pdo = new PDO('mysql:host=' . $db['host'] . ';dbname=' . $db['name'] . ';charset=utf8mb4',
        $db['user'], $db['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function hc_json(int $code, array $body): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

function hc_text(array $data, string $key, int $max, bool $required = false): string {
    if (isset($data[$key]) && !is_string($data[$key])) throw new InvalidArgumentException('Некорректное поле формы.');
    $raw = $data[$key] ?? '';
    if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $raw)) throw new InvalidArgumentException('Некорректное поле формы.');
    $s = trim($raw);
    if (!mb_check_encoding($s, 'UTF-8') || mb_strlen($s) > $max || ($required && $s === '')
        || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $s)) {
        throw new InvalidArgumentException('Проверьте заполненные поля и длину сообщения.');
    }
    return $s;
}

function hc_validate(array $d): array {
    if (($d['consent'] ?? null) !== 'yes') throw new InvalidArgumentException('Для отправки нужно дать согласие.');
    if (($d['consent_version'] ?? null) !== HC_CONSENT_VERSION) throw new InvalidArgumentException('Редакция согласия обновилась. Обновите страницу и ознакомьтесь с документом.');
    $name = hc_text($d, 'name', 100, true);
    $phone = preg_replace('/[\s()+-]/', '', hc_text($d, 'phone', 32, true));
    if (preg_match('/^8\d{10}$/D', $phone)) $phone = '7' . substr($phone, 1);
    if (!preg_match('/^7\d{10}$/D', $phone)) throw new InvalidArgumentException('Укажите телефон полностью: +7 и 10 цифр.');
    $package = hc_text($d, 'package', 100);
    if (!in_array($package, ['', 'Старт команды', 'Сильная команда', 'Капитал команды'], true)) throw new InvalidArgumentException('Выберите формат на сайте.');
    return [$name, '+' . $phone, hc_text($d, 'company', 200), hc_text($d, 'position', 150), $package, hc_text($d, 'message', 3000)];
}

function hc_rate(PDO $db, string $secret): bool {
    // No raw IP is stored. HMAC bucket expires after 15 minutes.
    $window = (int) floor(time() / 900);
    $key = hash_hmac('sha256', ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ':' . $window, $secret);
    $db->beginTransaction();
    try {
        $q = $db->prepare('INSERT INTO hc_rate_limits (bucket, expires_at) VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)) ON DUPLICATE KEY UPDATE hits=hits+1');
        $q->execute([$key]);
        $q = $db->prepare('SELECT hits FROM hc_rate_limits WHERE bucket=?');
        $q->execute([$key]);
        $hits = (int) $q->fetchColumn();
        $db->commit();
        return $hits <= 5;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }
}
