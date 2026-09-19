/**
 * ADE INBOX MANAGER — persistent user-to-user messaging (surrounding only).
 *
 * Uses existing storage abstraction (RuntimeConfigStore / Supabase adapter via
 * writeSection/readSection). No competing persistence.
 *
 * Boundaries:
 * - same tenant required (tenantId from workforce store or default "default")
 * - sender sees sent, recipient sees inbox
 * - Founder/Admin visibility follows existing RBAC (caller gates routes)
 * - no message body in telemetry/eventBus
 * - read/unread via readAt, thread via threadId
 */

function uid() {
  try { return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
  catch { return `msg_${Date.now()}`; }
}
function tnow() { return new Date().toISOString(); }

export class InboxManager {
  constructor({ store = null, eventBus = null } = {}) {
    this.store = store;
    this.eventBus = eventBus;
  }

  _load() {
    try {
      const sec = this.store?.readSection?.("inbox") ?? this.store?.read?.()?.inbox ?? null;
      if (Array.isArray(sec)) return sec;
      if (sec && typeof sec === "object" && Array.isArray(sec.messages)) return sec.messages;
      if (sec && typeof sec === "object") return Object.values(sec);
      return [];
    } catch { return []; }
  }
  _save(list) {
    try {
      if (typeof this.store?.writeSection === "function") this.store.writeSection("inbox", list);
    } catch {}
  }

  _tenantOf(person) {
    return String(person?.tenantId || person?.tenant || "default").slice(0,80);
  }

  send({ senderId, senderName, recipientId, recipientName, subject, body, threadId = null, replyTo = null, tenantId = null }) {
    const sid = String(senderId || "").trim();
    const rid = String(recipientId || "").trim();
    if (!sid) { const e=new Error("SENDER_REQUIRED"); e.code="SENDER_REQUIRED"; throw e; }
    if (!rid) { const e=new Error("RECIPIENT_REQUIRED"); e.code="RECIPIENT_REQUIRED"; throw e; }
    if (sid === rid) { const e=new Error("SELF_MESSAGE_NOT_ALLOWED"); e.code="SELF_MESSAGE_NOT_ALLOWED"; throw e; }
    const subj = String(subject || "").trim().slice(0,200) || "(no subject)";
    const b = String(body || "").trim().slice(0,5000);
    if (!b) { const e=new Error("BODY_REQUIRED"); e.code="BODY_REQUIRED"; throw e; }
    const id = uid();
    const tid = String(threadId || replyTo || id).slice(0,120);
    const rec = {
      messageId: id,
      threadId: tid,
      replyTo: replyTo ? String(replyTo).slice(0,120) : null,
      tenantId: String(tenantId || "default").slice(0,80),
      senderId: sid,
      senderName: String(senderName || sid).slice(0,80),
      recipientId: rid,
      recipientName: String(recipientName || rid).slice(0,80),
      subject: subj,
      body: b,
      createdAt: tnow(),
      updatedAt: tnow(),
      readAt: null,
      status: "UNREAD"
    };
    const list = this._load();
    list.push(rec);
    // cap 2000 messages, FIFO
    if (list.length > 2000) list.splice(0, list.length - 2000);
    this._save(list);
    try { this.eventBus?.publish?.("inbox.message.sent", { messageId: id, threadId: tid, senderId: sid, recipientId: rid }); } catch {}
    return rec;
  }

  inboxFor(userId, { tenantId = null } = {}) {
    const uid_ = String(userId || "");
    const all = this._load();
    return all.filter(m => m.recipientId === uid_ && (!tenantId || m.tenantId === String(tenantId))).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  }
  sentFor(userId, { tenantId = null } = {}) {
    const uid_ = String(userId || "");
    const all = this._load();
    return all.filter(m => m.senderId === uid_ && (!tenantId || m.tenantId === String(tenantId))).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  }
  thread(threadId) {
    const tid = String(threadId || "");
    const all = this._load();
    return all.filter(m => m.threadId === tid).sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
  }
  get(messageId) {
    const id = String(messageId || "");
    return this._load().find(m=>m.messageId===id) || null;
  }
  markRead(messageId, userId) {
    const list = this._load();
    const rec = list.find(m=>m.messageId===String(messageId));
    if (!rec) { const e=new Error("MESSAGE_NOT_FOUND"); e.code="MESSAGE_NOT_FOUND"; throw e; }
    if (rec.recipientId !== String(userId) && rec.senderId !== String(userId)) { const e=new Error("NOT_AUTHORIZED"); e.code="NOT_AUTHORIZED"; throw e; }
    if (!rec.readAt) { rec.readAt = tnow(); rec.status = "READ"; rec.updatedAt = tnow(); this._save(list); }
    return rec;
  }
  unreadCount(userId, { tenantId=null }={}) {
    return this.inboxFor(userId,{tenantId}).filter(m=>!m.readAt).length;
  }
  stats() {
    const all=this._load();
    return { total: all.length, unread: all.filter(m=>!m.readAt).length };
  }
}
export default InboxManager;
