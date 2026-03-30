function requireSecureValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required runtime configuration: ${name}`);
  }

  const weakFragments = ["change-me", "local-", "0123456789abcdef", "password", "secret"];
  if (value.length < 32 || weakFragments.some((fragment) => value.includes(fragment))) {
    throw new Error(`Weak runtime configuration rejected: ${name}`);
  }

  return value;
}

function requireValue(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required runtime configuration: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "production",
  appPort: Number(process.env.APP_PORT || 4000),
  mongoUri: requireValue("MONGO_URI"),
  mongoDbName: requireValue("MONGO_DB_NAME"),
  authTokenSecret: requireSecureValue("AUTH_TOKEN_SECRET"),
  refreshTokenSecret: requireSecureValue("REFRESH_TOKEN_SECRET"),
  requestSigningSecret: requireSecureValue("REQUEST_SIGNING_SECRET"),
  dataEncryptionKey: requireSecureValue("DATA_ENCRYPTION_KEY"),
  backupDirectory: process.env.BACKUP_DIRECTORY || "/var/lib/offline-system/backups",
  accessTokenTtlSeconds: 30 * 60,
  refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
  accountLockMinutes: 15,
  failedLoginLimit: 5,
  sessionRateLimitPerMinute: 60
};
