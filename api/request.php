<?php
declare(strict_types=1);
ini_set('display_errors', '0');
// www/hc-capital.ru/api -> account home/hc-capital-private
$private = dirname(__DIR__, 3) . '/hc-capital-private';
if (!is_file($private . '/bootstrap.php')) {
    http_response_code(503);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    exit('{"ok":false,"message":"Форма пока недоступна. Позвоните +7 978 127 1302."}');
}
require $private . '/bootstrap.php';

try {
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') hc_json(403, ['ok'=>false, 'message'=>'Откройте сайт через HTTPS.']);
    $c = hc_config();
    if (empty($c['enabled'])) hc_json(503, ['ok'=>false, 'message'=>'Форма готовится к запуску. Позвоните +7 978 127 1302.']);
    session_name('hc_form');
    session_set_cookie_params(['lifetime'=>0, 'path'=>'/api/', 'secure'=>true, 'httponly'=>true, 'samesite'=>'Strict']);
    ini_set('session.use_strict_mode', '1');
    session_start();
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($method === 'GET') {
        // Check availability before enabling the form.
        $db = hc_db($c);
        $db->query('SELECT id FROM hc_requests LIMIT 1');
        if (empty($_SESSION['csrf']) || ($_SESSION['expires'] ?? 0) < time()) {
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
            $_SESSION['expires'] = time() + 3600;
            $_SESSION['requests'] = [];
        }
        $requestId = bin2hex(random_bytes(16));
        $_SESSION['requests'][$requestId] = time();
        while (count($_SESSION['requests']) > 8) array_shift($_SESSION['requests']);
        hc_json(200, ['ok'=>true, 'csrf'=>$_SESSION['csrf'], 'request_id'=>$requestId, 'consent_version'=>HC_CONSENT_VERSION]);
    }
    if ($method !== 'POST') {
        header('Allow: GET, POST');
        hc_json(405, ['ok'=>false, 'message'=>'Метод не поддерживается.']);
    }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 20000) hc_json(413, ['ok'=>false, 'message'=>'Сообщение слишком длинное.']);
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) hc_json(415, ['ok'=>false, 'message'=>'Некорректный формат запроса.']);
    if (!in_array($_SERVER['HTTP_ORIGIN'] ?? '', ['https://hc-capital.ru', 'https://www.hc-capital.ru'], true)) hc_json(403, ['ok'=>false, 'message'=>'Отправьте заявку с сайта hc-capital.ru.']);
    $raw = file_get_contents('php://input', false, null, 0, 20001);
    if (strlen($raw) > 20000) hc_json(413, ['ok'=>false, 'message'=>'Сообщение слишком длинное.']);
    $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($data)) throw new InvalidArgumentException('Некорректная заявка.');
    if (!is_string($data['csrf'] ?? null) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $data['csrf'])
        || ($_SESSION['expires'] ?? 0) < time()) hc_json(403, ['ok'=>false, 'message'=>'Время заполнения истекло. Обновите страницу.']);
    if (!is_string($data['request_id'] ?? null) || !isset($_SESSION['requests'][$data['request_id']])) hc_json(403, ['ok'=>false, 'message'=>'Обновите страницу и повторите отправку.']);
    if (hc_text($data, 'website', 200) !== '') hc_json(400, ['ok'=>false, 'message'=>'Заявка не принята. Позвоните нам.']);
    $fields = hc_validate($data);
    $db = hc_db($c);
    $id = $data['request_id'];
    $q = $db->prepare('SELECT id FROM hc_requests WHERE id=?');
    $q->execute([$id]);
    if ($q->fetchColumn()) hc_json(200, ['ok'=>true, 'id'=>$id]);
    if (!hc_rate($db, $c['rate_secret'])) hc_json(429, ['ok'=>false, 'message'=>'Слишком много заявок. Попробуйте через 15 минут.']);
    $hash = hash_file('sha256', $private . '/consent/' . HC_CONSENT_VERSION . '.txt');
    if ($hash === false) throw new RuntimeException('Consent snapshot missing');
    $q = $db->prepare('INSERT INTO hc_requests (id,name,phone,company,position,package_name,message,consent_given,consent_version,consent_sha256) VALUES (?,?,?,?,?,?,?,1,?,?)');
    $q->execute([$id, ...$fields, HC_CONSENT_VERSION, $hash]);
    // Request and proof are durably stored before success; CRON delivers the email.
    hc_json(201, ['ok'=>true, 'id'=>$id]);
} catch (InvalidArgumentException | JsonException $e) {
    hc_json(422, ['ok'=>false, 'message'=>$e instanceof JsonException ? 'Некорректная заявка.' : $e->getMessage()]);
} catch (Throwable $e) {
    // Never log request bodies, credentials or database exception messages.
    error_log('HC form: service unavailable (' . get_class($e) . ')');
    hc_json(503, ['ok'=>false, 'message'=>'Не удалось принять заявку. Повторите позже или позвоните +7 978 127 1302.']);
}
