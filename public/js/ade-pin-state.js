/* ADE PIN ELEVATION STATE — shared client mirror of the server-verified
   six-digit authorization step-up. Persisted in BOTH sessionStorage and
   localStorage so sub-route navigation, refresh and page switches never drop
   the elevated JWT scope or bounce the operator back to the root login.
   The server remains the single authority: this mirror never grants access,
   it only keeps the client truthful about the session it already holds. */
(function () {
  var KEY = 'ade_active_pin';

  function safeGet(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function safeSet(store, k, v) { try { store.setItem(k, v); } catch (e) {} }
  function safeDel(store, k) { try { store.removeItem(k); } catch (e) {} }

  function read() {
    try {
      var s = safeGet(sessionStorage, KEY) || safeGet(localStorage, KEY);
      if (!s) return null;
      var o = JSON.parse(s);
      return o && typeof o === 'object' ? o : null;
    } catch (e) { return null; }
  }

  function write(state) {
    try {
      var s = JSON.stringify(state);
      safeSet(sessionStorage, KEY, s);
      safeSet(localStorage, KEY, s);
      return state;
    } catch (e) { return null; }
  }

  function clear() {
    safeDel(sessionStorage, KEY);
    safeDel(localStorage, KEY);
  }

  function isActive() {
    var s = read();
    return !!(s && s.active === true && s.at);
  }

  function tierForRole(role, level) {
    var r = String(role || '').toUpperCase();
    var lv = Number(level);
    if (r === 'FOUNDER' || r === 'FOUNDER_L3' || r === 'ADMIN_L3' || r === 'ADMINISTRATOR') return 'Level 3 (L3)';
    if (r === 'ADMIN_L2' || r === 'ADMIN') return 'Level 2 (L2)';
    if (r === 'ADMIN_L1' || r === 'OPERATOR') return 'Level 1 (L1)';
    if (r === 'PILOT' || r === 'VIEWER' || r === 'ADMIN_L0') return r === 'PILOT' || r === 'VIEWER' ? 'Tier 1' : 'Level 0 (L0)';
    if (r === 'PARTNER') return 'Enterprise Gateway';
    if (lv === 3) return 'Level 3 (L3)';
    if (lv === 2) return 'Level 2 (L2)';
    if (lv === 1) return 'Level 1 (L1)';
    return 'Level 0 (L0)';
  }

  function scopeForTier(tier, role) {
    var r = String(role || '').toUpperCase();
    if (r === 'FOUNDER' || r === 'FOUNDER_L3') return 'Full Sovereign Control Plane and Vaults';
    if (tier === 'Level 3 (L3)') return 'Executive System Administration';
    if (tier === 'Level 2 (L2)') return r === 'PARTNER' ? 'A2MPro Integration and Settlement Mesh' : 'Operational and Channel Management';
    if (tier === 'Level 1 (L1)') return r === 'PILOT' ? 'Trading and Live Engagement Portal' : 'Supervised Support and Intake';
    if (tier === 'Tier 1') return 'Trading and Live Engagement Portal';
    if (tier === 'Enterprise Gateway') return 'A2MPro Integration and Settlement Mesh';
    return 'Basic Administrative Viewer';
  }

  function subjectOf(person, claims) {
    try {
      if (person && person.username) return String(person.username);
      if (claims && (claims.sub || claims.username)) return String(claims.sub || claims.username);
    } catch (e) {}
    return null;
  }

  function set(payload) {
    try {
      var prev = read() || {};
      var next = {
        active: true,
        method: (payload && payload.method) || prev.method || 'PIN',
        role: (payload && payload.role) || prev.role || null,
        level: (payload && payload.level != null) ? Number(payload.level) : (prev.level != null ? prev.level : null),
        tier: (payload && payload.tier) || prev.tier || null,
        scope: (payload && payload.scope) || prev.scope || null,
        subject: (payload && payload.subject) || prev.subject || null,
        at: (payload && payload.at) || new Date().toISOString()
      };
      if (!next.tier && next.role) next.tier = tierForRole(next.role, next.level);
      if (!next.scope && next.tier) next.scope = scopeForTier(next.tier, next.role);
      return write(next);
    } catch (e) { return null; }
  }

  function hydrateFromClaims(session) {
    try {
      if (!session) return null;
      var person = session.person || null;
      var claims = session.claims || {};
      if (claims.pinVerified === true) {
        var role = String((person && person.role) || claims.role || '').toUpperCase() || null;
        var level = (person && person.level != null) ? person.level : claims.level;
        return set({ method: 'SERVER_VERIFIED', role: role, level: level });
      }
      var cur = read();
      var subj = subjectOf(person, claims);
      if (cur && cur.active && cur.subject && subj && cur.subject !== subj) clear();
      return cur;
    } catch (e) { return null; }
  }

  window.ADE_PIN_STATE = {
    KEY: KEY,
    read: read,
    set: set,
    clear: clear,
    isActive: isActive,
    tierForRole: tierForRole,
    scopeForTier: scopeForTier,
    hydrateFromClaims: hydrateFromClaims
  };
})();
