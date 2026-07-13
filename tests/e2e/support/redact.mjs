export const REDACTED = '[REDACTED]';

const sensitiveKey = /(authorization|cookie|password|passwd|secret|session|token)/i;
const sensitiveQueryKey = /^(access_token|auth|authorization|cookie|password|secret|session|session_token|token)$/i;

export function redactString(input) {
  let value = String(input);

  value = value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  value = value.replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`);
  value = value.replace(/\bgh[opusr]_[A-Za-z0-9_]{8,}\b/g, REDACTED);
  value = value.replace(
    /\b(cookie|set-cookie)\s*:\s*[^\r\n]+/gi,
    (_match, key) => `${key}: ${REDACTED}`,
  );
  value = value.replace(
    /\b(password|passwd|secret|session_token|sessiontoken|token)\s*([=:])\s*([^\s,;&]+)/gi,
    (_match, key, separator) => `${key}${separator}${REDACTED}`,
  );

  try {
    const url = new URL(value);
    let changed = false;
    for (const key of url.searchParams.keys()) {
      if (sensitiveQueryKey.test(key)) {
        url.searchParams.set(key, REDACTED);
        changed = true;
      }
    }
    if (changed) value = url.toString();
  } catch {
    // Most evidence strings are not URLs.
  }

  return value;
}

export function redactValue(value, key = '') {
  if (sensitiveKey.test(String(key))) return REDACTED;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(item => redactValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, entryKey),
      ]),
    );
  }
  return value;
}
