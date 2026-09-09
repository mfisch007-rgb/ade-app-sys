import crypto from "node:crypto";
import EnterpriseEventBus from "./EnterpriseEventBus.js";

export const ICX_ROLES = Object.freeze(["Founder", "Executive", "Department Head", "Manager", "Team Lead", "Operational Staff"]);
export const ICX_CHANNELS = Object.freeze(["DIRECT", "TEAM", "DEPARTMENT", "PRODUCT", "ESCALATION", "ANNOUNCEMENT"]);
export const ICX_MESSAGE_TYPES = Object.freeze(["TEXT", "DOCUMENT", "FILE", "IMAGE", "VIDEO", "VOICE", "SYSTEM_EVENT", "ESCALATION_REQUEST"]);

const ROLE_RANK = Object.fromEntries(ICX_ROLES.map((role, i) => [role, ICX_ROLES.length - i]));

export class ADE_ICX_Engine {
  constructor({ eventBus = EnterpriseEventBus.getInstance() } = {}) {
    this.eventBus = eventBus;
    this.staff = new Map();
    this.messages = [];
    this.escalations = [];
    this.kernel = null;
    this.status = "STOPPED";
  }

  initialize(kernel = null) {
    this.kernel = kernel;
    this.status = "ONLINE";
    return this;
  }

  async boot(kernel = null) {
    return this.initialize(kernel);
  }

  async dispose() {
    this.status = "OFFLINE";
    this.kernel = null;
  }

  async shutdown() {
    return this.dispose();
  }

  getHealth() {
    return {
      status: this.status,
      staffCount: this.staff.size,
      messageCount: this.messages.length,
      escalationCount: this.escalations.length
    };
  }

  upsertStaff(profile) {
    if (!profile?.id || !profile?.fullName || !ICX_ROLES.includes(profile.role)) throw new Error("ICX staff identity is incomplete or role is invalid.");
    const record = {
      id: profile.id, fullName: profile.fullName, role: profile.role,
      previousRoles: profile.previousRoles || [], unit: profile.unit || "ADE Core",
      department: profile.department || "Operations", branch: profile.branch || "HQ",
      city: profile.city || "", country: profile.country || "",
      workEmail: profile.workEmail || "", workContactNumber: profile.workContactNumber || "",
      active: profile.active !== false, lastSeen: profile.lastSeen || null,
      lastActive: profile.lastActive || null, presence: profile.presence || "OFFLINE",
      managerId: profile.managerId || null, teamId: profile.teamId || null
    };
    this.staff.set(record.id, record);
    this.eventBus.publish("ICX_STAFF_UPSERTED", { id: record.id, role: record.role, unit: record.unit });
    return record;
  }

  setPresence(id, presence, { actorId = null, actorLevel = 4 } = {}) {
    if (!["ONLINE", "AWAY", "BUSY", "OFFLINE"].includes(presence)) throw new Error("Invalid ICX presence.");
    const staff = this.staff.get(id); if (!staff) throw new Error("Unknown staff identity.");
    if (actorId && actorId !== id && Number(actorLevel) < 3) throw new Error("ICX presence authorization denied.");
    const now = new Date().toISOString();
    staff.presence = presence;
    staff.lastSeen = now;
    if (presence !== "OFFLINE") staff.lastActive = now;
    this.eventBus.publish("ICX_PRESENCE_CHANGED", { id, presence, lastSeen: staff.lastSeen, lastActive: staff.lastActive });
    return staff;
  }

  canCommunicate(senderId, recipientId, channel = "DIRECT") {
    const sender = this.staff.get(senderId), recipient = this.staff.get(recipientId);
    if (!sender || !recipient || !sender.active || !recipient.active || !ICX_CHANNELS.includes(channel)) return false;
    if (channel === "DIRECT") return sender.id === recipient.id || sender.managerId === recipient.id || recipient.managerId === sender.id || sender.department === recipient.department || ROLE_RANK[sender.role] >= ROLE_RANK[recipient.role] + 2;
    if (channel === "TEAM") return Boolean(sender.teamId && sender.teamId === recipient.teamId);
    if (channel === "DEPARTMENT") return sender.department === recipient.department;
    if (channel === "PRODUCT") return sender.unit === recipient.unit;
    if (channel === "ESCALATION") return true;
    if (channel === "ANNOUNCEMENT") return ROLE_RANK[sender.role] >= ROLE_RANK["Department Head"];
    return false;
  }

  sendMessage({ senderId, recipientId = null, channel = "DIRECT", type = "TEXT", body = "", media = null }, { actorId = null, actorLevel = 4 } = {}) {
    if (!ICX_MESSAGE_TYPES.includes(type) || !ICX_CHANNELS.includes(channel)) throw new Error("Unsupported ICX message type or channel.");
    if (actorId && actorId !== senderId) throw new Error("ICX sender identity must match the authenticated session.");
    const sender = this.staff.get(senderId);
    if (!sender || !sender.active) throw new Error("Unknown or inactive ICX sender identity.");
    if (channel === "DIRECT" && !recipientId) throw new Error("Direct messages require a recipient.");
    if (recipientId && !this.canCommunicate(senderId, recipientId, channel)) throw new Error("ICX communication policy denied this recipient.");
    if (!recipientId && channel !== "ANNOUNCEMENT") {
      if (channel !== "ESCALATION" && Number(actorLevel) < 3) throw new Error("ICX broadcast authorization denied.");
    }
    if (channel === "ANNOUNCEMENT" && ROLE_RANK[sender.role] < ROLE_RANK["Department Head"]) throw new Error("ICX announcement authorization denied.");
    if (body.length > 20000) throw new Error("ICX message exceeds size limit.");
    if (media) {
      const allowed = /^(image|video|audio|application\/pdf|text\/plain|text\/csv)$/.test(media.mimeType || "");
      if (!allowed || Number(media.sizeBytes || 0) > 25 * 1024 * 1024 || /\.(exe|dll|bat|cmd|ps1|sh|msi|com|scr)$/i.test(media.fileName || "")) throw new Error("ICX media policy rejected the attachment.");
    }
    const message = { id: crypto.randomUUID(), senderId, recipientId, channel, type, body, media: media ? { mimeType: media.mimeType, sizeBytes: media.sizeBytes, fileName: media.fileName } : null, createdAt: new Date().toISOString() };
    this.messages.push(message); if (this.messages.length > 5000) this.messages.shift();
    this.eventBus.publish("ICX_MESSAGE_SENT", { id: message.id, senderId, recipientId, channel, type });
    return message;
  }

  escalate({ requesterId, reason, category = "GENERAL", targetId = null }, { actorId = null, actorLevel = 4 } = {}) {
    if (actorId && actorId !== requesterId && Number(actorLevel) < 3) throw new Error("ICX escalation authorization denied.");
    const requester = this.staff.get(requesterId); if (!requester) throw new Error("Unknown escalation requester.");
    const chain = ICX_ROLES.slice(4).reverse();
    let target = targetId && this.staff.get(targetId);
    if (!target) {
      const nextRole = requester.role === "Operational Staff" ? "Team Lead" : requester.role === "Team Lead" ? "Manager" : requester.role === "Manager" ? "Department Head" : requester.role === "Department Head" ? "Executive" : "Founder";
      target = [...this.staff.values()].find(s => s.role === nextRole && s.unit === requester.unit && s.active) || [...this.staff.values()].find(s => s.role === nextRole && s.active);
    }
    const escalation = { id: crypto.randomUUID(), requesterId, targetId: target?.id || null, route: chain, reason: String(reason || "").slice(0, 5000), category, state: "OPEN", createdAt: new Date().toISOString() };
    this.escalations.push(escalation);
    this.eventBus.publish("ICX_ESCALATION_CREATED", escalation);
    return escalation;
  }

  getSnapshot() { return { staff: [...this.staff.values()], messages: this.messages.slice(-100), escalations: this.escalations.slice(-100) }; }
}
export default ADE_ICX_Engine;
