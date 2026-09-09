import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import test from "node:test";
import assert from "node:assert/strict";

const tmp =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "ade-g18-14-r18abc-"
    )
  );

const credentialFile =
  path.join(tmp, "credential.json");

const revokeFile =
  path.join(tmp, "revocations.json");

process.env.ADE_CREDENTIAL_STORE_FILE =
  credentialFile;

process.env.ADE_SESSION_REVOCATION_FILE =
  revokeFile;

const {
  default: CredentialLifecycleStore
} = await import(
  "../../src/security/CredentialLifecycleStore.js"
);

const {
  default: IdentityOnboarding
} = await import(
  "../../src/kernel/IdentityOnboarding.js"
);

test(
  "R18-A privileged sessions require credential version",
  async () => {

    const events = [];

    const eventBus = {
      publish(type, payload) {
        events.push({ type, payload });
      }
    };

    const store =
      new CredentialLifecycleStore(
        credentialFile,
        eventBus
      );

    await store.initialize(
      await bcrypt.hash("246813", 12),
      await bcrypt.hash(
        "RECOVERY-KEY-123",
        12
      )
    );

    const identity =
      new IdentityOnboarding({
        credentialStore: store,
        eventBus
      });

    const session =
      identity.issueSession({
        subject: "admin",
        tier: "COMMUNITY",
        level: 2,
        persona: "ADMIN",
        edition: "COMMUNITY"
      });

    const header =
      JSON.parse(
        Buffer.from(
          session.token.split(".")[0],
          "base64url"
        ).toString("utf8")
      );

    const claims =
      JSON.parse(
        Buffer.from(
          session.token.split(".")[1],
          "base64url"
        ).toString("utf8")
      );

    delete claims.credentialVersion;

    const b64 =
      value =>
        Buffer.from(
          JSON.stringify(value)
        ).toString("base64url");

    const input =
      `${b64(header)}.${b64(claims)}`;

    const legacyToken =
      `${input}.${crypto
        .createSign("RSA-SHA256")
        .update(input)
        .end()
        .sign(
          identity.keyManager.getPrivateKey(),
          "base64url"
        )}`;

    assert.throws(
      () =>
        identity.verifySession(legacyToken),
      /credential version is missing/i
    );
  }
);

test(
  "R18-B rotation emits security event",
  async () => {

    const events = [];

    const store =
      new CredentialLifecycleStore(
        credentialFile,
        {
          publish(type, payload) {
            events.push({ type, payload });
          }
        }
      );

    await store.rotatePin("135790");

    assert.ok(
      events.some(
        event =>
          event.type === "SECURITY_EVENT" &&
          event.payload?.type ===
            "CREDENTIAL_ROTATED"
      )
    );
  }
);

test(
  "R18-C recovery emits security event",
  async () => {

    const events = [];

    const store =
      new CredentialLifecycleStore(
        credentialFile,
        {
          publish(type, payload) {
            events.push({ type, payload });
          }
        }
      );

    await store.recoverPin(
      "RECOVERY-KEY-123",
      "975310"
    );

    assert.ok(
      events.some(
        event =>
          event.type === "SECURITY_EVENT" &&
          event.payload?.type ===
            "CREDENTIAL_RECOVERED"
      )
    );
  }
);
