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

const ROLE_AUTHORITY = Object.freeze({
  FOUNDER: 4,
  ADMIN: 3,
  OPERATOR: 2,
  ANALYST: 1,
  VIEWER: 0
});

function authorityOf(role) {
  return ROLE_AUTHORITY[String(role || "").toUpperCase()] ?? -1;
}

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
  const inv = person.invitation || null;
  return {
    id: person.id,
    username: person.username,
    fullName: person.fullName,
    role: person.role,
    level: person.level,
    status: person.status,
    invitationPending: Boolean(inv),
    invitationCreatedAt: inv?.createdAt ?? null,
    invitationExpiresAt: typeof inv?.expiresAt === "number" ? new Date(inv.expiresAt).toISOString() : (inv?.expiresAt ?? null),
    invitationRemainingMs: typeof inv?.expiresAt === "number" ? Math.max(0, inv.expiresAt - Date.now()) : null,
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

  #assertDurableStore() {
    if (
      typeof this.store?.isDurable === "function" &&
      this.store.isDurable() === false
    ) {
      throw new Error("WORKFORCE_STORAGE_UNAVAILABLE");
    }
  }

  async initialize() {
    if (this.#ready) return this.#ready;
    this.#ready = (async () => {
      this.#assertDurableStore();
      let state;
      try {
        state = await this.store.get(STORE_KEY, null);
      } catch {
        throw new Error("WORKFORCE_STORAGE_UNAVAILABLE");
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

  async #refreshState() {
    this.#assertDurableStore();
    let fresh;
    try {
      fresh = await this.store.get(STORE_KEY, null);
    } catch {
      throw new Error("WORKFORCE_STORAGE_UNAVAILABLE");
    }
    if (fresh === null) return;
    if (
      typeof fresh !== "object" ||
      typeof fresh.persons !== "object" ||
      typeof fresh.agents !== "object"
    ) {
      throw new Error("WORKFORCE_STORE_CORRUPT");
    }
    this.#state = fresh;
  }

  async #ensureFreshState() {
    await this.whenReady();
    await this.#refreshState();
  }

  async #persist() {
    this.#assertDurableStore();
    try {
      await this.store.set(STORE_KEY, this.#state);
    } catch {
      throw new Error("WORKFORCE_STORAGE_UNAVAILABLE");
    }
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

  #resolveActor(actor) {
    if (!actor) return null;
    if (typeof actor === "object") {
      return {
        id: actor.id ?? null,
        username: actor.username ?? null,
        role: String(actor.role || "").toUpperCase(),
        level: Number(actor.level) || roleLevel(actor.role)
      };
    }
    return this.#getPerson(actor);
  }

  #assertInviteAuthority(actor, role) {
    if (!actor) return;
    const actorAuthority = authorityOf(actor.role);
    const requestedAuthority = authorityOf(role);
    if (actorAuthority < ROLE_AUTHORITY.OPERATOR || requestedAuthority >= actorAuthority) {
      throw new Error("INSUFFICIENT_AUTHORIZATION");
    }
  }

  #assertCanManage(actor, target, { newRole = null } = {}) {
    if (target?.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    if (!actor) return;
    if (target && target.id === actor.id) throw new Error("SELF_MANAGEMENT_FORBIDDEN");
    const actorAuthority = authorityOf(actor.role);
    const targetAuthority = authorityOf(target?.role);
    if (actorAuthority < ROLE_AUTHORITY.ADMIN || targetAuthority > actorAuthority) {
      throw new Error("INSUFFICIENT_AUTHORIZATION");
    }
    if (newRole && authorityOf(newRole) >= actorAuthority) {
      throw new Error("INSUFFICIENT_AUTHORIZATION");
    }
  }

  #assertLastAdminProtected(actor, target, { nextRole, nextStatus, nextExpiry } = {}) {
    if (!target || target.role !== "ADMIN" || this.#effectiveStatus(target) !== "ACTIVE") return;
    if (actor?.role === "FOUNDER") return;
    const staysAdmin = nextRole === undefined || nextRole === "ADMIN";
    const staysActive = nextStatus === undefined || nextStatus === "ACTIVE";
    const noExpiry = nextExpiry === undefined || nextExpiry === null;
    if (staysAdmin && staysActive && noExpiry) return;
    const activeAdmins = Object.values(this.#state.persons).filter(
      (person) => person.role === "ADMIN" && this.#effectiveStatus(person) === "ACTIVE"
    );
    if (activeAdmins.length <= 1) throw new Error("LAST_ADMIN_PROTECTED");
  }

  async listPersons() {
    await this.#ensureFreshState();
    return Object.values(this.#state.persons)
      .map(redact)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.username.localeCompare(b.username));
  }

  async getPerson(id) {
    await this.#ensureFreshState();
    return redact(this.#getPerson(id));
  }

  async getPersonRecord(id) {
    await this.#ensureFreshState();
    return { ...this.#getPerson(id) };
  }

  async getPersonByUsername(username) {
    await this.#ensureFreshState();
    const normalized = String(username || "").trim().toLowerCase();
    const person = Object.values(this.#state.persons).find(
      (p) => p.username && p.username.toLowerCase() === normalized
    );
    return person ? { ...person } : null;
  }

  async personCount() {
    await this.#ensureFreshState();
    return Object.keys(this.#state.persons).length;
  }

  async provisionFounder({ fullName, username, password, pin } = {}) {
    await this.#ensureFreshState();
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

  async invite({ fullName, role = "OPERATOR", expiresInDays = DEFAULT_INVITE_WINDOW_DAYS, createdBy = null, actor = null } = {}) {
    await this.#ensureFreshState();
    this.#assertFullName(fullName);
    const normalizedRole = String(role || "").toUpperCase();
    if (!isValidRole(normalizedRole) || normalizedRole === "FOUNDER") {
      throw new Error("INVALID_ROLE");
    }
    const actorRecord = this.#resolveActor(actor);
    this.#assertInviteAuthority(actorRecord, normalizedRole);
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
      createdBy: createdBy || actorRecord?.username || null,
      lastLoginAt: null,
      updatedAt: now,
      note: "Invited"
    };
    await this.#persist();
    this.#audit("WORKFORCE_INVITATION_ISSUED", { personId: id, role: normalizedRole });
    return { person: redact(this.#state.persons[id]), inviteCode: code };
  }

  async acceptInvitation({ code, fullName, username, password, pin } = {}) {
    await this.#ensureFreshState();
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
    await this.#ensureFreshState();
    const normalized = String(username || "").trim().toLowerCase();
    let storedId = null;
    let stored = null;
    for (const [id, p] of Object.entries(this.#state.persons)) {
      if (p.username && p.username.toLowerCase() === normalized) {
        storedId = id;
        stored = p;
        break;
      }
    }
    if (!stored) {
      this.#audit("AUTHENTICATION_FAILED", { username: String(username || "") });
      return null;
    }
    if (this.#effectiveStatus(stored) !== "ACTIVE") {
      this.#audit("AUTHENTICATION_FAILED", { subject: stored.username, reason: "ACCOUNT_NOT_ACTIVE" });
      return null;
    }
    if (!verify(password, stored.passwordHash)) {
      this.#audit("AUTHENTICATION_FAILED", { subject: stored.username, reason: "INVALID_PASSWORD" });
      return null;
    }
    stored.lastLoginAt = new Date().toISOString();
    stored.updatedAt = stored.lastLoginAt;
    await this.#persist();
    this.#audit("WORKFORCE_LOGIN", { subject: stored.username, role: stored.role, personId: stored.id });
    return redact(stored);
  }

  async verifyPin(personId, pin) {
    await this.#ensureFreshState();
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
    await this.#ensureFreshState();
    const normalized = String(username || "").trim().toLowerCase();
    const person = Object.values(this.#state.persons).find(
      (p) => p.username && p.username.toLowerCase() === normalized
    );
    if (!person) return false;
    if (this.#effectiveStatus(person) !== "ACTIVE") return false;
    return verify(code, person.recoveryHashes.find((c) => verify(code, c)) || null);
  }

  async rotateRecoveryCodes(personId, actorId = null) {
    await this.#ensureFreshState();
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
    await this.#ensureFreshState();
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
    await this.#ensureFreshState();
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
    await this.#ensureFreshState();
    const person = this.#getPerson(personId);
    const actor = this.#resolveActor(actorId);
    if (person.id === (actor?.id ?? null)) {
      throw new Error("USE_SELF_SERVICE_CHANGE");
    }
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    this.#assertCanManage(actor, person);
    this.#assertPinFormat(newPin);
    person.pinHash = hash(newPin);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PIN_IMPOSED_BY_ADMIN", { subject: person.username, by: actor?.username ?? null });
    return true;
  }

  async resetPassword(personId, actorId, newPassword) {
    await this.#ensureFreshState();
    const person = this.#getPerson(personId);
    const actor = this.#resolveActor(actorId);
    if (person.id === (actor?.id ?? null)) {
      throw new Error("USE_SELF_SERVICE_CHANGE");
    }
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    this.#assertCanManage(actor, person);
    this.#assertPasswordStrength(newPassword);
    person.passwordHash = hash(newPassword);
    person.credentialVersion += 1;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("PASSWORD_RESET_BY_ADMIN", { subject: person.username, by: actor?.username ?? null });
    return true;
  }

  async recoverPassword(username, recoveryCode, newPassword) {
    await this.#ensureFreshState();
    const person = Object.values(this.#state.persons).find(
      (p) => p.username && String(username || "").trim().toLowerCase() === p.username.toLowerCase()
    );
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
    await this.#ensureFreshState();
    const person = this.#getPerson(personId);
    const actor = this.#resolveActor(actorId);
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    const normalizedRole = String(newRole || "").toUpperCase();
    if (!isValidRole(normalizedRole) || normalizedRole === "FOUNDER") {
      throw new Error("INVALID_ROLE");
    }
    this.#assertCanManage(actor, person, { newRole: normalizedRole });
    this.#assertLastAdminProtected(actor, person, { nextRole: normalizedRole });
    person.role = normalizedRole;
    person.level = roleLevel(normalizedRole);
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("WORKFORCE_ROLE_CHANGED", { subject: person.username, role: normalizedRole, by: actor?.username ?? null });
    return redact(person);
  }

  async setStatus(personId, status, actorId) {
    await this.#ensureFreshState();
    const person = this.#getPerson(personId);
    const actor = this.#resolveActor(actorId);
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    if (!["ACTIVE", "SUSPENDED", "REVOKED"].includes(status)) {
      throw new Error("INVALID_STATUS");
    }
    this.#assertCanManage(actor, person);
    this.#assertLastAdminProtected(actor, person, { nextStatus: status });
    person.status = status;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("WORKFORCE_STATUS_CHANGED", { subject: person.username, status, by: actor?.username ?? null });
    return redact(person);
  }

  async setExpiry(personId, accessExpiryAt, actorId) {
    await this.#ensureFreshState();
    const person = this.#getPerson(personId);
    const actor = this.#resolveActor(actorId);
    if (person.role === "FOUNDER") throw new Error("FOUNDER_PROTECTED");
    let expiry = null;
    if (accessExpiryAt === null) {
      expiry = null;
    } else {
      const t = new Date(accessExpiryAt).getTime();
      if (!Number.isFinite(t)) throw new Error("INVALID_EXPIRY");
      if (t <= Date.now()) throw new Error("EXPIRY_MUST_BE_FUTURE");
      expiry = t;
    }
    this.#assertCanManage(actor, person);
    this.#assertLastAdminProtected(actor, person, { nextExpiry: expiry });
    person.accessExpiryAt = expiry;
    person.updatedAt = new Date().toISOString();
    await this.#persist();
    this.#audit("ACCESS_EXPIRY_SET", { subject: person.username, accessExpiryAt: person.accessExpiryAt, by: actor?.username ?? null });
    return redact(person);
  }

  async createAgent({ name, purpose, createdBy = null } = {}) {
    await this.#ensureFreshState();
    if (typeof name !== "string" || name.trim().length < 2) {
      throw new Error("INVALID_AGENT_NAME");
    }
    if (typeof purpose !== "string" || purpose.trim().length < 3) {
      throw new Error("INVALID_AGENT_PURPOSE");
    }
    const id = this.#nextId();
    const now = new Date().toISOString();
    this.#state.agents[id] = {
      id,
      name: name.trim(),
      purpose: purpose.trim(),
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
    await this.#ensureFreshState();
    const agent = this.#state.agents[agentId];
    if (!agent) throw new Error("AGENT_NOT_FOUND");
    if (typeof patch.name === "string" && patch.name.trim().length >= 2) {
      agent.name = patch.name.trim();
    }
    if (patch.purpose !== undefined) {
      if (typeof patch.purpose !== "string" || patch.purpose.trim().length < 3) {
        throw new Error("INVALID_AGENT_PURPOSE");
      }
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
    await this.#ensureFreshState();
    const agent = this.#state.agents[agentId];
    if (!agent) return null;
    agent.lastUsedAt = new Date().toISOString();
    await this.#persist();
    return { ...agent };
  }

  async listAgents() {
    await this.#ensureFreshState();
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