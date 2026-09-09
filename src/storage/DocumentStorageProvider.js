/**
 * ADE document-oriented storage contract.
 *
 * Used for services whose existing persistence model is a
 * complete JSON document rather than independent key/value records.
 */
export class DocumentStorageProvider {
  readSync(_defaultValue = {}) {
    throw new Error("DocumentStorageProvider.readSync() not implemented.");
  }

  writeSync(_value) {
    throw new Error("DocumentStorageProvider.writeSync() not implemented.");
  }

  async read(_defaultValue = {}) {
    throw new Error("DocumentStorageProvider.read() not implemented.");
  }

  async write(_value) {
    throw new Error("DocumentStorageProvider.write() not implemented.");
  }
}

export default DocumentStorageProvider;
