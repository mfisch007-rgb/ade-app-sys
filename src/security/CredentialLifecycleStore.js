import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { atomicWriteFileSync } from "../storage/atomicWrite.js";

const PIN_PATTERN = /^\d{6}$/;

export class CredentialLifecycleStore {
  constructor(
    filePath = process.env.ADE_CREDENTIAL_STORE_FILE ||
      "data/admin-credential.json",
    eventBus = null
  ) {
    this.filePath = path.resolve(filePath);
    this.eventBus = eventBus;
  }

  #audit(type, payload = {}) {
    try {
      this.eventBus?.publish(
        "SECURITY_EVENT",
        { type, ...payload }
      );
    } catch {}
  }

  #ensureDirectory() {
    try {
      fs.mkdirSync(
        path.dirname(this.filePath),
        { recursive: true }
      );
    } catch {
      // Filesystem unavailable — operate in env-var-only mode.
    }
  }

  #load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }

      const parsed = JSON.parse(
        fs.readFileSync(this.filePath, "utf8")
      );

      const validRecoveryHash =
        parsed.recoveryHash === null ||
        (
          typeof parsed.recoveryHash === "string" &&
          parsed.recoveryHash.startsWith("$2")
        );

      if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof parsed.pinHash !== "string" ||
        !parsed.pinHash.startsWith("$2") ||
        !validRecoveryHash ||
        !Number.isInteger(parsed.credentialVersion) ||
        parsed.credentialVersion < 1
      ) {
        throw new Error(
          "CREDENTIAL_STORE_CORRUPT"
        );
      }

      return parsed;
    } catch {
      return null;
    }
  }

  #atomicWrite(record) {
    this.#ensureDirectory();

    try {
      atomicWriteFileSync(
        this.filePath,
        JSON.stringify(record, null, 2),
        {
          encoding: "utf8",
          mode: 0o600
        }
      );
    } catch {
      // Filesystem unavailable (e.g. serverless) — credential state is in-memory only.
    }
  }

  async initialize(
    pinHash,
    recoveryHash = null
  ) {
    if (
      typeof pinHash !== "string" ||
      !pinHash.startsWith("$2")
    ) {
      throw new Error(
        "INITIAL_PIN_HASH_REQUIRED"
      );
    }

    if (
      recoveryHash !== null &&
      (
        typeof recoveryHash !== "string" ||
        !recoveryHash.startsWith("$2")
      )
    ) {
      throw new Error(
        "INVALID_RECOVERY_HASH"
      );
    }

    const existing = this.#load();

    if (existing) {
      return {
        credentialVersion:
          existing.credentialVersion
      };
    }

    this.#atomicWrite({
      pinHash,
      recoveryHash,
      credentialVersion: 1,
      updatedAt:
        new Date().toISOString()
    });

    return {
      credentialVersion: 1
    };
  }

  async ensureInitialized(
    pinHash,
    recoveryHash = null
  ) {
    const existing = this.#load();

    if (!existing) {
      return this.initialize(
        pinHash,
        recoveryHash
      );
    }

    if (
      existing.recoveryHash === null &&
      typeof recoveryHash === "string" &&
      recoveryHash.startsWith("$2")
    ) {
      return this.provisionRecoveryHash(
        recoveryHash
      );
    }

    return {
      credentialVersion:
        existing.credentialVersion
    };
  }

  async provisionRecoveryHash(
    recoveryHash
  ) {
    if (
      typeof recoveryHash !== "string" ||
      !recoveryHash.startsWith("$2")
    ) {
      throw new Error(
        "INVALID_RECOVERY_HASH"
      );
    }

    const record = this.#load();

    if (!record) {
      throw new Error(
        "CREDENTIAL_STORE_NOT_INITIALIZED"
      );
    }

    if (record.recoveryHash !== null) {
      return {
        credentialVersion:
          record.credentialVersion
      };
    }

    this.#atomicWrite({
      ...record,
      recoveryHash,
      updatedAt:
        new Date().toISOString()
    });

    return {
      credentialVersion:
        record.credentialVersion
    };
  }

  async verifyPin(pin) {
    if (
      typeof pin !== "string" ||
      !PIN_PATTERN.test(pin)
    ) {
      return false;
    }

    const record = this.#load();

    if (!record) {
      return false;
    }

    return bcrypt.compare(
      pin,
      record.pinHash
    );
  }

  async rotatePin(newPin) {
    if (
      typeof newPin !== "string" ||
      !PIN_PATTERN.test(newPin)
    ) {
      throw new Error(
        "INVALID_PIN_FORMAT"
      );
    }

    const record = this.#load();

    if (!record) {
      throw new Error(
        "CREDENTIAL_STORE_NOT_INITIALIZED"
      );
    }

    const pinHash =
      await bcrypt.hash(
        newPin,
        12
      );

    const credentialVersion =
      record.credentialVersion + 1;

    this.#atomicWrite({
      ...record,
      pinHash,
      credentialVersion,
      updatedAt:
        new Date().toISOString()
    });

    this.#audit(
      "CREDENTIAL_ROTATED",
      { credentialVersion }
    );


    return {
      credentialVersion
    };
  }

  async recoverPin(
    recoverySecret,
    newPin
  ) {
    if (
      typeof newPin !== "string" ||
      !PIN_PATTERN.test(newPin)
    ) {
      throw new Error(
        "INVALID_PIN_FORMAT"
      );
    }

    const record = this.#load();

    if (!record) {
      throw new Error(
        "CREDENTIAL_STORE_NOT_INITIALIZED"
      );
    }

    if (!record.recoveryHash) {
      throw new Error(
        "RECOVERY_NOT_CONFIGURED"
      );
    }

    const valid =
      typeof recoverySecret === "string" &&
      await bcrypt.compare(
        recoverySecret,
        record.recoveryHash
      );

    if (!valid) {
      throw new Error(
        "RECOVERY_AUTHORIZATION_FAILED"
      );
    }

    const pinHash =
      await bcrypt.hash(
        newPin,
        12
      );

    const credentialVersion =
      record.credentialVersion + 1;

    this.#atomicWrite({
      ...record,
      pinHash,
      credentialVersion,
      updatedAt:
        new Date().toISOString()
    });

    this.#audit(
      "CREDENTIAL_RECOVERED",
      { credentialVersion }
    );

    return {
      credentialVersion
    };
  }

  getCredentialVersion() {
    const record = this.#load();

    if (!record) {
      throw new Error(
        "CREDENTIAL_STORE_NOT_INITIALIZED"
      );
    }

    return record.credentialVersion;
  }
}

export default CredentialLifecycleStore;
