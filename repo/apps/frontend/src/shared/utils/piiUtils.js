const PII_VIEW_PERMISSION = "PII_VIEW";

export function hasPiiViewPermission(user) {
  return (user?.permissions || []).includes(PII_VIEW_PERMISSION);
}

export function maskPhone(value) {
  if (!value) {
    return "";
  }
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return "*".repeat(value.length - 4) + value.slice(-4);
}

export function maskAddress(value) {
  return value ? "***masked***" : "";
}

export function displayPii(value, canView, maskFn) {
  if (canView) {
    return value || "";
  }
  return maskFn(value);
}
