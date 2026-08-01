// ADE Base Storage Adapter Interface
class StorageAdapter {
  async get(key) { throw new Error("Not Implemented"); }
  async set(key, value) { throw new Error("Not Implemented"); }
}
module.exports = StorageAdapter;
