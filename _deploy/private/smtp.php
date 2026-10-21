<?php
declare(strict_types=1);

// Minimal SMTP AUTH LOGIN over implicit TLS. No visitor input enters headers.
function hc_smtp(array $c, string $body, string $id): void {
    foreach (['from', 'to', 'user'] as $key) {
        if (!filter_var($c[$key], FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $c[$key])) throw new RuntimeException('Invalid mail configuration');
    }
    if ((int)$c['port'] !== 465) throw new RuntimeException('Use TLS port 465');
    $ctx = stream_context_create(['ssl'=>['verify_peer'=>true, 'verify_peer_name'=>true, 'peer_name'=>$c['host'], 'allow_self_signed'=>false]]);
    $s = stream_socket_client('ssl://' . $c['host'] . ':465', $errno, $errstr, 20, STREAM_CLIENT_CONNECT, $ctx);
    if ($s === false) throw new RuntimeException('SMTP connection failed');
    stream_set_timeout($s, 20);
    $read = static function (array $codes) use ($s): void {
        $last = '';
        for ($i=0; $i<100; $i++) {
            $line = fgets($s, 4096);
            if ($line === false) throw new RuntimeException('SMTP response failed');
            $last = $line;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        if (!in_array((int)substr($last, 0, 3), $codes, true) || strlen($last) < 4 || $last[3] !== ' ') throw new RuntimeException('SMTP rejected command');
    };
    $write = static function (string $text) use ($s): void {
        $offset = 0;
        while ($offset < strlen($text)) {
            $n = fwrite($s, substr($text, $offset));
            if ($n === false || $n === 0) throw new RuntimeException('SMTP write failed');
            $offset += $n;
        }
    };
    $cmd = static function (string $text, array $codes) use ($write, $read): void { $write($text . "\r\n"); $read($codes); };
    try {
        $read([220]);
        $cmd('EHLO hc-capital.ru', [250]);
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($c['user']), [334]);
        $cmd(base64_encode($c['password']), [235]);
        $cmd('MAIL FROM:<' . $c['from'] . '>', [250]);
        $cmd('RCPT TO:<' . $c['to'] . '>', [250,251]);
        $cmd('DATA', [354]);
        $subject = '=?UTF-8?B?' . base64_encode('Новая заявка — Капитал талантов') . '?=';
        $headers = ['Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
            'From: ' . $c['from'], 'To: ' . $c['to'], 'Subject: ' . $subject,
            'Message-ID: <' . $id . '@hc-capital.ru>', 'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
        $write(implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($body), 76, "\r\n") . ".\r\n");
        $read([250]); // Accepted by SMTP, not proof of inbox delivery.
        @fwrite($s, "QUIT\r\n");
    } finally { fclose($s); }
}

function hc_telegram(array $c): void {
    if (empty($c['enabled'])) return;
    if (!preg_match('/^\d+:[A-Za-z0-9_-]+$/D', $c['token'] ?? '')) throw new RuntimeException('Telegram configuration missing');
    $curl = curl_init('https://api.telegram.org/bot' . $c['token'] . '/sendMessage');
    curl_setopt_array($curl, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>10,
        CURLOPT_TIMEOUT=>20, CURLOPT_HTTPHEADER=>['Content-Type: application/json'],
        CURLOPT_POSTFIELDS=>json_encode(['chat_id'=>$c['chat_id'], 'text'=>'Новая заявка на сайте. Проверьте почту.'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
    $response = curl_exec($curl);
    $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    if ($status !== 200 || !is_string($response) || empty(json_decode($response, true)['ok'])) throw new RuntimeException('Telegram delivery failed');
}
