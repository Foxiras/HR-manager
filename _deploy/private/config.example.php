<?php
// Copy to config.php here, OUTSIDE www/. Never commit real passwords to GitHub.
return [
    'enabled' => false, // Enable only after DB, CRON and mail tests; use check.php.
    'db' => [
        'host' => 'localhost', // Confirm actual MySQL host in hosting settings.
        'name' => 'u3690832_hc_requests',
        'user' => 'u3690832_hc_form',
        'password' => 'CHANGE_ME',
    ],
    'smtp' => [
        'host' => 'mail.hosting.reg.ru',
        'port' => 465,
        'user' => 'site@hc-capital.ru',
        'password' => 'CHANGE_ME',
        'from' => 'site@hc-capital.ru',
        'to' => 'site@hc-capital.ru',
    ],
    // Set once using a password manager: random string, at least 32 characters.
    'rate_secret' => 'CHANGE_ME',
    // Optional. The bot sends ONLY a fixed notification, never form fields.
    'telegram' => ['enabled' => false, 'token' => '', 'chat_id' => ''],
];
