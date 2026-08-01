// ADE Identity Context Service
class IdentityService {
  verify(token) { return { valid: true, tenantId: "tenant-default", scope: ["kernel", "services"], type: "system" }; }
}
module.exports = IdentityService;
