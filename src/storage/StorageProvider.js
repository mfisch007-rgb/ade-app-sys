/**
 * ADE canonical storage contract.
 *
 * Async methods are the portable persistence contract.
 * Sync methods are optional local-runtime compatibility primitives.
 */
export class StorageProvider {
  async get(_key, _defaultValue = null) {
    throw new Error("StorageProvider.get() not implemented.");
  }

  async set(_key, _value) {
    throw new Error("StorageProvider.set() not implemented.");
  }

  async delete(_key) {
    throw new Error("StorageProvider.delete() not implemented.");
  }

  async list(_prefix = "") {
    throw new Error("StorageProvider.list() not implemented.");
  }

  async append(_key, _value) {
    throw new Error("StorageProvider.append() not implemented.");
  }

  async transaction(_callback) {
    throw new Error("StorageProvider.transaction() not implemented.");
  }

  getSync(_key, _defaultValue = null) {
    throw new Error("Synchronous storage is not supported by this provider.");
  }

  setSync(_key, _value) {
    throw new Error("Synchronous storage is not supported by this provider.");
  }

  deleteSync(_key) {
    throw new Error("Synchronous storage is not supported by this provider.");
  }

  listSync(_prefix = "") {
    throw new Error("Synchronous storage is not supported by this provider.");
  }
}

export default StorageProvider;
