/**
 * Canonical redaction for admin runtime settings responses.
 *
 * Secret-shaped leaves (API keys, tokens, passwords, secrets …) are masked on
 * every read AND on write-echo, so credentials written through PATCH are
 * never returned raw in any API response. Policy values (booleans, enums,
 * non-secret strings/numbers) stay intact for legitimate console reads.
 */

const SECRET_KEY_RE = /(api[_-]?key|secret|token|password|passphrase|private[_-]?key|client[_-]?secret|authorization|bearer)/i;
const SETTING_KEY_RE = /^[A-Za-z][A-Za-z0-9_.-]{0,80}$/;
const UNSAFE_SETTING_KEY_RE = /(__proto__|constructor|prototype|api[_-]?key|secret|token|password|passphrase|private[_-]?key|client[_-]?secret|authorization|bearer|credential|ssid)/i;
const MAX_STRING_LENGTH = 2000;
const MAX_SECTION_KEYS = 100;

export const SETTINGS_SECTIONS = Object.freeze(["settings", "ui", "policies"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSettingsSectionAllowed(section) {
  return SETTINGS_SECTIONS.includes(String(section || ""));
}

export function isSettingsKeyAllowed(key) {
  const value = String(key || "");
  return SETTING_KEY_RE.test(value) && !UNSAFE_SETTING_KEY_RE.test(value);
}

export function isSettingsScalarValue(value) {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
  if (typeof value === "string") return value.length <= MAX_STRING_LENGTH && !value.includes("\0");
  return false;
}

export function safeSettingsView(value) {
  const source = isPlainObject(value) ? value : {};
  const out = {};
  for (const section of SETTINGS_SECTIONS) {
    const sourceSection = isPlainObject(source[section]) ? source[section] : {};
    const safeSection = {};
    for (const [key, entry] of Object.entries(sourceSection)) {
      if (!isSettingsKeyAllowed(key)) continue;
      if (!isSettingsScalarValue(entry)) continue;
      safeSection[key] = entry;
    }
    out[section] = safeSection;
  }
  return out;
}

export function validateSettingsPatch(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "SETTINGS_BODY_INVALID", message: "settings body must be an object of allowlisted sections." };
  }
  const entries = Object.entries(body);
  if (!entries.length || entries.length > SETTINGS_SECTIONS.length) {
    return { ok: false, error: "SETTINGS_BODY_INVALID", message: "provide at least one allowlisted settings section." };
  }
  const clean = {};
  for (const [section, values] of entries) {
    if (!isSettingsSectionAllowed(section)) {
      return { ok: false, error: "SETTINGS_SECTION_NOT_ALLOWED", message: `${section} is not an editable settings section.` };
    }
    if (!isPlainObject(values)) {
      return { ok: false, error: "SETTINGS_SECTION_INVALID", message: `${section} must be an object of key/value settings.` };
    }
    const sectionEntries = Object.entries(values);
    if (sectionEntries.length > MAX_SECTION_KEYS) {
      return { ok: false, error: "SETTINGS_SECTION_TOO_LARGE", message: `${section} exceeds ${MAX_SECTION_KEYS} settings.` };
    }
    const safeSection = {};
    for (const [key, entry] of sectionEntries) {
      if (!isSettingsKeyAllowed(key)) {
        return { ok: false, error: "SETTINGS_KEY_NOT_ALLOWED", message: `${key} is not an allowed settings key.` };
      }
      if (!isSettingsScalarValue(entry)) {
        return { ok: false, error: "SETTINGS_VALUE_INVALID", message: `${section}.${key} must be a string, number, boolean or null.` };
      }
      safeSection[key] = entry;
    }
    clean[section] = safeSection;
  }
  return { ok: true, sections: clean };
}

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

export default {
  maskSettingsSecrets,
  safeSettingsView,
  validateSettingsPatch,
  isSettingsSectionAllowed,
  isSettingsKeyAllowed,
  isSettingsScalarValue,
  SETTINGS_SECTIONS
};
