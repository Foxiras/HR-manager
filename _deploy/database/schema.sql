CREATE TABLE IF NOT EXISTS hc_requests (
  id CHAR(32) CHARACTER SET ascii PRIMARY KEY,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_interaction_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retain_for_contract TINYINT(1) NOT NULL DEFAULT 0,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  company VARCHAR(200) NOT NULL DEFAULT '',
  position VARCHAR(150) NOT NULL DEFAULT '',
  package_name VARCHAR(100) NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  consent_given TINYINT(1) NOT NULL,
  consent_version VARCHAR(32) NOT NULL,
  consent_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  mail_sent_at DATETIME NULL,
  mail_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  telegram_sent_at DATETIME NULL,
  telegram_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX queue_idx (mail_sent_at, next_attempt_at),
  INDEX retention_idx (retain_for_contract, last_interaction_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hc_rate_limits (
  bucket CHAR(64) CHARACTER SET ascii PRIMARY KEY,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  expires_at DATETIME NOT NULL,
  INDEX expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
