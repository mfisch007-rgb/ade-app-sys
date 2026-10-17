/**
 * Canonical redaction for admin runtime settings responses.
 *
 * Secret-shaped leaves (API keys, tokens, passwords, secrets …) are masked on
 * every read AND on write-echo, so credentials written through PATCH are
 * never returned raw in any API response. Policy values (booleans, enums,
 * non-secret strings/numbers) stay intact for legitimate console reads.
 */

const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|passphrase|private[_-]?key|client[_-]?secret|authorization|bearer)/i;

export function maskSettingsSecrets(value, depth = 0) {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => maskSettingsSecrets(v, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" && v.length > 0 && SECRET_KEY_RE.test(k)) {
      out[k] = "••••••••";
      continue;
    }
    out[k] = maskSettingsSecrets(v, depth + 1);
  }
  return out;
}

export default { maskSettingsSecrets };
