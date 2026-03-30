const SENSITIVE_KEYS = new Set([
  "password", "newpassword", "token", "accesstoken", "refreshtoken",
  "csrftoken", "requestsigningkey", "secret", "answer", "answerhash",
  "passwordhash", "cookie", "authorization", "x-signature", "x-csrf-token"
]);

const SENSITIVE_PATTERNS = [
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
];

function redactValue(key, value) {
  if (typeof key === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return "***redacted***";
  }
  if (typeof value === "string") {
    let redacted = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      redacted = redacted.replace(pattern, "***redacted***");
    }
    return redacted;
  }
  return value;
}

function redactObject(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item));
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = typeof value === "object" && value !== null
      ? redactObject(value)
      : redactValue(key, value);
  }
  return result;
}

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let minLevel = "info";

export function setLogLevel(level) {
  if (LEVELS[level] !== undefined) {
    minLevel = level;
  }
}

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[minLevel];
}

function formatEntry(level, category, message, data) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, level, category, message };
  if (data !== undefined) {
    entry.data = redactObject(data);
  }
  return entry;
}

export const logger = {
  debug(category, message, data) {
    if (shouldLog("debug")) {
      console.debug(JSON.stringify(formatEntry("debug", category, message, data)));
    }
  },
  info(category, message, data) {
    if (shouldLog("info")) {
      console.info(JSON.stringify(formatEntry("info", category, message, data)));
    }
  },
  warn(category, message, data) {
    if (shouldLog("warn")) {
      console.warn(JSON.stringify(formatEntry("warn", category, message, data)));
    }
  },
  error(category, message, data) {
    if (shouldLog("error")) {
      console.error(JSON.stringify(formatEntry("error", category, message, data)));
    }
  }
};

export { redactObject, redactValue };
