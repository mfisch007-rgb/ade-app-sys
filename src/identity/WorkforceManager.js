import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const STORE_KEY = "ade:workforce:v1";
const BCRYPT_ROUNDS = 10;
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
const PIN_PATTERN = /^\d{6}$/;
const PASSWORD_MIN = 8;
const RECOVERY_CODE_COUNT = 5;
const RECOVERY_CODE_LENGTH = 10;
const INVITE_CODE_LENGTH = 12;
const INVITE_CODE_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";

export const WORKFORCE_ROLES = Object.freeze({
  FOUNDER: 3,
  ADMIN: 2,
  OPERATOR: 2,
  ANALYST: 1,
  VIEWER: 1
});

export const WIZARD_ROLE = "OPERATOR";
export const DEFAULT_INVITE_WINDOW_DAYS = 7;

export function roleLevel(role) {
  return WORKFORCE_ROLES[String(role || "").toUpperCase()] ?? 1;
}

export function isValidRole(role) {
  return Object.prototype.hasOwnProperty.call(WORKFORCE_ROLES, String(role || "").toUpperCase());
}

function hash(value) {
  return bcrypt.hashSync(String(value), BCRYPT_ROUNDS);
}

function verify(value, hashValue) {
  if (!hashValue) return false;
  try {
    return bcrypt.compareSync(String(value), hashValue);
  } catch {
    return false;
  }
}

function generateCode(length, alphabet) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function redact(person) {
  return {
    id: person.id,
    username: person.username,
    fullName: person.fullName,
    role: person.role,
    level: person.level,
    status: person.status,
    invitationPending: Boolean(person.invitation),
    accessExpiryAt: person.accessExpiryAt ?? null,
    credentialVersion: person.credentialVersion,
    lastLoginAt: person.lastLoginAt ?? null,
    createdAt: person.createdAt,
    createdBy: person.createdBy ?? null,
    agentsGranted: Array.isArray(person.agentsGranted) ? person.agentsGranted : []
  };
}

export class WorkforceManager {
  constructor({ store, eventBus = null } = {}) {
    if (!store) {
      throw new Error("WorkforceManager requires a StorageProvider.");
    }
    this.store = store;
    this.eventBus = eventBus;
    this.#state = null;
    this.#ready = null;
  }

  #state = null;
  #ready = null;

  #audit(type, payload = {}) {
    try {
      this.eventBus?.publish?.("SECURITY_EVENT", { type, ...payload });
    } catch {}
  }

  async initialize() {
    if (this.#ready) return this.#ready;
    this.#ready = (async () => {
      let state;
      try {
        state = await this.store.get(STORE_KEY, null);
      } catch {
        state = null;
      }
      if (state === null) {
        state = { persons: {}, agents: {}, seq: 0 };
      }
      if (
        typeof state !== "object" ||
        typeof state.persons !== "object" ||
        typeof state.agents !== "object"
      ) {
        throw new Error("WORKFORCE_STORE_CORRUPT");
      }
      this.#state = state;
      return this;
    })();
    return this.#ready;
  }

  whenReady() {
    return this.#ready || this.initialize();
  }

  async #persist() {
    await this.store.set(STORE_KEY, this.#state);
  }

  #nextId() {
    this.#state.seq += 1;
    return `WRF-${String(this.#state.seq).padStart(5, "0")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  #getPerson(id) {
    const person = this.#state.persons[id];
    if (!person) throw new Error("PERSON_NOT_FOUND");
    return person;
  }

  #effectiveStatus(person) {
    if (person.status !== "ACTIVE") return person.status;
    if (person.accessExpiryAt && Date.now() > person.accessExpiryAt) {
      return "EXPIRED";
    }
    return "ACTIVE";
  }

  #assertUsernameAvailable(username) {
    const normalized = String(username || "").trim().toLowerCase();
    if (!USERNAME_PATTERN.test(normalized)) {
      throw new Error("INVALID_USERNAME");
    }
    const exists = Object.values(this.#state.persons).some(
      (p) => p.username && p.username.toLowerCase() === normalized
    );
    if (exists) throw new Error("USERNAME_TAKEN");
    return normalized;
  }

  #assertPasswordStrength(password) {
    if (typeof password !== "string" || password.length < PASSWORD_MIN) {
      throw new Error("INVALID_PASSWORD");
    }
  }

  #assertPinFormat(pin) {
    if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) {
      throw new Error("INVALID_PIN");
    }
  }

  #assertFullName(fullName) {
    if (typeof fullName !== "string" || fullName.trim().length < 2) {
      throw new Error("INVALID_FULL_NAME");
    }
  }

  async listPersons() {
    await this.whenReady();
    return Object.values(this.#state.persons)
      .map(redact)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.username.localeCompare(b.username));
  }

  async getPerson(id) {
    await this.whenReady();
    return redact(this.#getPerson(id));
  }

  async getPersonRecord(id) {
    await this.whenReady();
    return { ...this.#getPerson(id) };
  }

  async getPersonByUsername(username) {
    await this.whenReady();
    const normalized = String(username || "").trim().toLowerCase();
    const person = Object.values(this.#state.persons).find(
      (p) => p.username.toLowerCase() === normalized
    );
    return person ? { ...person } : null;
  }

  async personCount() {
    await this.whenReady();
    return Object.keys(this.#state.persons).length;
  }

  async provisionFounder({ fullName, username, password, pin } = {}) {
    await this.whenReady();
    const count = Object.keys(this.#state.persons).length;
    if (count > 0) {
      throw new Error("FOUNDER_ALREADY_PROVISIONED");
    }
    this.#assertFullName(fullName);
    const normalizedUsername = this.#assertUsernameAvailable(username);
    this.#assertPasswordStrength(password);
    this.#assertPinFormat(pin);
    const id = this.#nextId();
    const now = new Date().toISOString();
    this.#state.persons[id] = {
      id,
      username: normalizedUsername,
      fullName: fullName.trim(),
      role: "FOUNDER",
      level: roleLevel("FOUNDER"),
      status: "ACTIVE",
      passwordHash: hash(password),
      pinHash: hash(pin),
      recoveryHashes: [],
      invitation: null,
      accessExpiryAt: null,
      credentialVersion: 1,
      createdAt: now,
      createdBy: null,
      lastLoginAt: null,
      updatedAt: now,
      note: "Founder"
    };
    await this.#persist();
    this.#audit("WORKFORCE_FOUNDER_PROVISIONED", { personId: id });
    return redact(this.#state.persons[id]);
  }

  async invite({ fullName, role = "OPERATOR", expiresInDays = DEFAULT_INVITE_WINDOW_DAYS, createdBy = null } = {}) {
    await this.whenReady();
    this.#assertFullName(fullName);
    const normalizedRole = String(role || "").toUpperCase();
    if (!isValidRole(normalizedRole) || normalizedRole === "FOUNDER") {
      throw new Error("INVALID_ROLE");
    }
    const days = Number(expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 90) {
      throw new Error("INVALID_INVITE_WINDOW");
    }
    const code = generateCode(INVITE_CODE_LENGTH, INVITE_CODE_ALPHABET);
    const id = this.#nextId();
    const now = new Date().toISOString();
    const expiresAt = Date.now() + days * 24 * 60 * 60 * 1000;
    this.#state.persons[id] = {
      id,
      username: null,
      fullName: fullName.trim(),
      role: normalizedRole,
      level: roleLevel(normalizedRole),
      status: "INVITED",
      passwordHash: null,
      pinHash: null,
      recoveryHashes: [],
      invitation: {
        codeHash: hash(code),
        createdAt: now,
        expiresAt
      },
      accessExpiryAt: null,
      credentialVersion: 1,
      createdAt: now,
      createdBy: createdBy || null,
      lastLoginAt: null,
      updatedAt: now,
      note: "Invited"
    };
    await this.#persist();
    this.#audit("WORKFORCE_INVITATION_ISSUED", { personId: id, role: normalizedRole });
    return { person: redact(this.#state.persons[id]), inviteCode: code };
  }

  async acceptInvitation({ code, fullName, username, password, pin } = {}) {
    await this.whenReady();
    if (!code) throw new Error("INVITATION_CODE_REQUIRED");
    this.#assertFullName(fullName);
    const normalizedUsername = this.#assertUsernameAvailable(username);
    this.#assertPasswordStrength(password);
    this.#assertPinFormat(pin);
    const person = Object.values(this.#state.persons).find(
      (p) => p.status === "INVITED" && p.invitation && verify(code, p.invitation.codeHash)
    );
    if (!person) throw new Error("INVITATION_INVALID");
    if (person.invitation.expiresAt && Date.now() > person.invitation.expiresAt) {
      throw new Error("INVITATION_EXPIRED");
    }
    const now = new Date().toISOString();
    person.username = normalizedUsername;
    person.fullName = fullName.trim();
    person.passwordHash = hash(password);
    person.pinHash = hash(pin);
    person.recoveryHashes = [];
    person.invitation = null;
    person.status = "ACTIVE";
    person.credentialVersion += 1;
    person.updatedAt = now;
    person.note = "Accepted invitation";
    await this.#persist();
    this.#audit("WORKFORCE_INVITATION_ACCEPTED", { personId: person.id, role: person.role });
    return redact(person);
  }

  async authenticate(username, password) {
    await this.whenReady();
    const person = await this.getPersonByUsername(username);
    if (!person) {
      this.#audit("AUTHENTICATION_FAILED", { username: String(username || "") });
      return null;
    }
    if (this.#effectiveStatus(person) !== "ACTIVE") {
      this.#audit("AUTHENTICATION_FAILED", { subject: person.username, reason: "ACCOUNT_NOT_ACTIVE" });
      return null;
    }
    if (!verify(password, person.passwordHash)) {
      this.#audit("AUTHENTICATION_FAILED", { subject: person.username, reason: "INVALID_PASSWORD" });
      return null;
    }
    person.lastLoginAt = new Date().toISOString();
    await this.#persist();
    this.#audit("WORKFORCE_LOGIN", { subject: person.username, role: person.role, personId: person.id });
    return redact(person);
  }

  async verifyPin(personId, pin) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    if (this.#effectiveStatus(person) !== "ACTIVE") return false;
    const valid = verify(pin, person.pinHash);
    if (!valid) {
      this.#audit("PIN_VERIFICATION_FAILED", { subject: person.username });
    } else {
      person.lastPinAt = new Date().toISOString();
      person.updatedAt = person.lastPinAt;
      await this.#persist();
    }
    return valid;
  }

  async verifyRecoveryCode(username, code) {
    await this.whenReady();
    const person = await this.getPersonByUsername(username);
    if (!person) return false;
    if (this.#effectiveStatus(person) !== "ACTIVE") return false;
    return verify(code, person.recoveryHashes.find((c) => verify(code, c)) || null);
  }

  async rotateRecoveryCodes(personId, actorId = null) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    if (actorId && actorId !== person.id) {
      const actor = this.#getPerson(actorId);
      if (!["FOUNDER", "ADMIN", "OPERATOR"].includes(actor.role)) {
        throw new Error("INSUFFICIENT_AUTHORIZATION");
      }
    }
    const codes = [];
    const hashes = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const code = generateCode(RECOVERY_CODE_LENGTH, INVITE_CODE_ALPHABET);
      codes.push(code);
      hashes.push(hash(code));
    }
    person.recoveryHashes = hashes;
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("RECOVERY_CODES_ROTATED", { subject: person.username });
    return { codes };
  }

  async changePassword(personId, currentPassword, newPassword) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    if (!verify(currentPassword, person.passwordHash)) {
      throw new Error("CURRENT_PASSWORD_INVALID");
    }
    this.#assertPasswordStrength(newPassword);
    person.passwordHash = hash(newPassword);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PASSWORD_CHANGED", { subject: person.username });
    return true;
  }

  async changePin(personId, currentPassword, newPin) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    if (!verify(currentPassword, person.passwordHash)) {
      throw new Error("CURRENT_PASSWORD_INVALID");
    }
    this.#assertPinFormat(newPin);
    person.pinHash = hash(newPin);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PIN_CHANGED", { subject: person.username });
    return true;
  }

  async imposePin(personId, actorId, newPin) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    const actor = actorId ? this.#getPerson(actorId) : null;
    if (person.id === (actor?.id ?? null)) {
      throw new Error("USE_SELF_SERVICE_CHANGE");
    }
    this.#assertPinFormat(newPin);
    person.pinHash = hash(newPin);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PIN_IMPOSED_BY_ADMIN", { subject: person.username, by: actor?.username ?? null });
    return true;
  }

  async resetPassword(personId, actorId, newPassword) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    const actor = actorId ? this.#getPerson(actorId) : null;
    if (person.id === (actor?.id ?? null)) {
      throw new Error("USE_SELF_SERVICE_CHANGE");
    }
    this.#assertPasswordStrength(newPassword);
    person.passwordHash = hash(newPassword);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PASSWORD_RESET_BY_ADMIN", { subject: person.username, by: actor?.username ?? null });
    return true;
  }

  async recoverPassword(username, recoveryCode, newPassword) {
    await this.whenReady();
    const person = await this.getPersonByUsername(username);
    if (!person) throw new Error("RECOVERY_FAILED");
    if (this.#effectiveStatus(person) !== "ACTIVE") throw new Error("ACCOUNT_NOT_ACTIVE");
    this.#assertPasswordStrength(newPassword);
    const stored = this.#getPerson(person.id);
    const idx = stored.recoveryHashes.findIndex((c) => verify(recoveryCode, c));
    if (idx === -1) throw new Error("RECOVERY_FAILED");
    stored.recoveryHashes.splice(idx, 1);
    stored.passwordHash = hash(newPassword);
    stored.credentialVersion += 1;
    stored.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PASSWORD_RECOVERED", { subject: person.username });
    return true;
  }

  async changeRole(personId, newRole, actorId) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    const actor = actorId ? this.#getPerson(actorId) : null;
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    const normalizedRole = String(newRole || "").toUpperCase();
    if (!isValidRole(normalizedRole) || normalizedRole === "FOUNDER") {
      throw new Error("INVALID_ROLE");
    }
    person.role = normalizedRole;
    person.level = roleLevel(normalizedRole);
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("WORKFORCE_ROLE_CHANGED", { subject: person.username, role: normalizedRole, by: actor?.username ?? null });
    return redact(person);
  }

  async setStatus(personId, status, actorId) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    const actor = actorId ? this.#getPerson(actorId) : null;
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
      throw new Error("INVALID_STATUS");
    }
    person.status = status;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("WORKFORCE_STATUS_CHANGED", { subject: person.username, status, by: actor?.username ?? null });
    return redact(person);
  }

  async setExpiry(personId, accessExpiryAt, actorId) {
    await this.whenReady();
    const person = this.#getPerson(personId);
    const actor = actorId ? this.#getPerson(actorId) : null;
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    if (accessExpiryAt === null) {
      person.accessExpiryAt = null;
    } else {
      const t = new Date(accessExpiryAt).getTime();
      if (!Number.isFinite(t)) throw new Error("INVALID_EXPIRY");
      if (t <= Date.now()) throw new Error("EXPIRY_MUST_BE_FUTURE");
      person.accessExpiryAt = t;
    }
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("ACCESS_EXPIRY_SET", { subject: person.username, accessExpiryAt: person.accessExpiryAt, by: actor?.username ?? null });
    return redact(person);
  }

  async createAgent({ name, purpose, createdBy = null } = {}) {
    await this.whenReady();
    if (typeof name !== "string" || name.trim().length < 2) {
      throw new Error("INVALID_AGENT_NAME");
    }
    const id = this.#nextId();
    const now = new Date().toISOString();
    this.#state.agents[id] = {
      id,
      name: name.trim(),
      purpose: typeof purpose === "string" ? purpose.trim() : "",
      status: "ACTIVE",
      createdAt: now,
      createdBy: createdBy || null,
      lastUsedAt: null
    };
    await this.#persist();
    this.#audit("AGENT_IDENTITY_CREATED", { agentId: id, name: this.#state.agents[id].name });
    return { ...this.#state.agents[id] };
  }

  async updateAgent(agentId, patch, actorId = null) {
    await this.whenReady();
    const agent = this.#state.agents[agentId];
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    if (typeof patch.name === "string" && patch.name.trim().length >= 2) {
      agent.name = patch.name.trim();
    }
    if (typeof patch.purpose === "string") {
      agent.purpose = patch.purpose.trim();
    }
    if (patch.status !== undefined) {
      if (!["ACTIVE", "SUSPENDED"].includes(patch.status)) {
        throw new Error("INVALID_AGENT_STATUS");
      }
      agent.status = patch.status;
    }
    agent.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("AGENT_IDENTITY_UPDATED", { agentId, by: actorId });
    return { ...agent };
  }

  async markAgentUsed(agentId) {
    await this.whenReady();
    const agent = this.#state.agents[agentId];
    if (!agent) return null;
    agent.lastUsedAt = new Date().toISOString();
    return agent;
  }

  async listAgents() {
    await this.whenReady();
    return Object.values(this.#state.agents).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  stats() {
    const persons = Object.values(this.#state?.persons || {});
    return {
      total: persons.length,
      active: persons.filter((p) => p.status === "ACTIVE").length,
      invited: persons.filter((p) => p.status === "INVITED").length,
      suspended: persons.filter((p) => p.status === "SUSPENDED").length,
      revoked: persons.filter((p) => p.status === "REVOKED").length,
      expired: persons.filter((p) => this.#effectiveStatus(p) === "EXPIRED").length,
      agents: Object.values(this.#state?.agents || {}).length,
      founderProvisioned: persons.some((p) => p.role === "FOUNDER")
    };
  }
}

export default WorkforceManager;