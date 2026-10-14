import fs from "node:fs";

const file = "./src/kernel/EnterpriseKernelMaster.js";

let source = fs.readFileSync(file, "utf8");

/*
 * Exact preconditions derived from the verified source.
 */
const isBootedAnchor = /    this\.isBooted = false;\r?\n/;
const bootStartAnchor =
  /  async boot\(\) \{\r?\n    if \(this\.isBooted\) \{\r?\n      return \{ status: "ALREADY_RUNNING", \.\.\.this\.getSystemState\(\) \};\r?\n    \}\r?\n\r?\n    const start = Date\.now\(\);\r?\n/;

if ((source.match(/this\.isBooted = false;/g) || []).length !== 1) {
  throw new Error("EXPECTED_ONE_ISBOOTED_FIELD");
}

if ((source.match(/^\s*async boot\(\) \{/gm) || []).length !== 1) {
  throw new Error("EXPECTED_ONE_ASYNC_BOOT_METHOD");
}

if ((source.match(/^\s*async dispatchIntent\(/gm) || []).length !== 1) {
  throw new Error("EXPECTED_ONE_DISPATCH_METHOD");
}

if (source.includes("this._bootPromise")) {
  throw new Error("BOOT_PROMISE_ALREADY_PRESENT");
}

if (!isBootedAnchor.test(source)) {
  throw new Error("ISBOOTED_ANCHOR_NOT_FOUND");
}

if (!bootStartAnchor.test(source)) {
  throw new Error("BOOT_START_ANCHOR_NOT_FOUND");
}

/*
 * 1. Add exactly one in-flight Promise field.
 */
source = source.replace(
  isBootedAnchor,
  "    this.isBooted = false;\n    this._bootPromise = null;\n"
);

/*
 * 2. Replace only the boot declaration + existing initial guard.
 * The original boot implementation beginning with
 * `const start = Date.now();` remains the implementation body.
 */
const bootGate =
`  boot() {
    if (this.isBooted) {
      return Promise.resolve({
        ...this.getSystemState(),
        status: "ALREADY_RUNNING"
      });
    }

    if (this._bootPromise) {
      return this._bootPromise;
    }

    const bootPromise = this._performBoot();
    this._bootPromise = bootPromise;

    bootPromise.then(
      () => {
        if (this._bootPromise === bootPromise) {
          this._bootPromise = null;
        }
      },
      () => {
        if (this._bootPromise === bootPromise) {
          this._bootPromise = null;
        }
      }
    );

    return bootPromise;
  }

  async _performBoot() {
    const start = Date.now();
`;

source = source.replace(bootStartAnchor, bootGate);

/*
 * 3. Structural verification.
 */
const promiseFieldCount =
  (source.match(/^\s*this\._bootPromise = null;\s*$/gm) || []).length;

const syncBootCount =
  (source.match(/^\s*boot\(\)\s*\{/gm) || []).length;

const asyncBootCount =
  (source.match(/^\s*async boot\(\)\s*\{/gm) || []).length;

const performBootCount =
  (source.match(/^\s*async _performBoot\(\)\s*\{/gm) || []).length;

const dispatchCount =
  (source.match(/^\s*async dispatchIntent\(/gm) || []).length;

if (promiseFieldCount !== 1) {
  throw new Error("PROMISE_FIELD_COUNT=" + promiseFieldCount);
}

if (syncBootCount !== 1) {
  throw new Error("SYNC_BOOT_COUNT=" + syncBootCount);
}

if (asyncBootCount !== 0) {
  throw new Error("ASYNC_BOOT_COUNT=" + asyncBootCount);
}

if (performBootCount !== 1) {
  throw new Error("PERFORM_BOOT_COUNT=" + performBootCount);
}

if (dispatchCount !== 1) {
  throw new Error("DISPATCH_COUNT=" + dispatchCount);
}

if (!source.includes("return this._bootPromise;")) {
  throw new Error("INFLIGHT_RETURN_MISSING");
}

if (!source.includes('status: "ALREADY_RUNNING"')) {
  throw new Error("ALREADY_RUNNING_CONTRACT_MISSING");
}

fs.writeFileSync(file, source, "utf8");

console.log("PATCH=PASS");
console.log("PROMISE_FIELD_COUNT=" + promiseFieldCount);
console.log("SYNC_BOOT_COUNT=" + syncBootCount);
console.log("ASYNC_BOOT_COUNT=" + asyncBootCount);
console.log("PERFORM_BOOT_COUNT=" + performBootCount);
console.log("DISPATCH_COUNT=" + dispatchCount);
