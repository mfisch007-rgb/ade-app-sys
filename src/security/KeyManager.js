import fs from "fs";
import path from "path";
import { generateKeyPairSync } from "crypto";

export class KeyManager {
  constructor() {
    this.keyDir = path.resolve(process.cwd(), ".keys");
    this.pubKeyPath = path.join(this.keyDir, "ade_rsa.pub");
    this.privKeyPath = path.join(this.keyDir, "ade_rsa.pem");
    this.initKeys();
  }

  static getInstance() {
    if (!global.__keyManagerInstance) {
      global.__keyManagerInstance = new KeyManager();
    }
    return global.__keyManagerInstance;
  }

  initKeys() {
    if (!fs.existsSync(this.keyDir)) {
      fs.mkdirSync(this.keyDir, { recursive: true });
    }

    if (!fs.existsSync(this.pubKeyPath) || !fs.existsSync(this.privKeyPath)) {
      const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" }
      });
      fs.writeFileSync(this.pubKeyPath, publicKey, "utf8");
      fs.writeFileSync(this.privKeyPath, privateKey, "utf8");
    }

    this.publicKey = fs.readFileSync(this.pubKeyPath, "utf8");
    this.privateKey = fs.readFileSync(this.privKeyPath, "utf8");
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPrivateKey() {
    return this.privateKey;
  }
}

export default KeyManager;
