// ═══════════════════════════════════════════════════════════
// Alpha-Aliph ADE-LedgerFlow™ — Admin Role System
// File: src/config/adminRoles.js
//
// Admin Levels (highest to lowest):
// 1. OWNER          → Full access, all functions, all clients
// 2. SENIOR_ADMIN   → All client management, no system config
// 3. ADMIN          → Onboard clients, view all, limited actions
// 4. MARKETER       → Onboard clients only, see own downliners
// 5. SUPPORT        → View client data, respond to tickets
// ═══════════════════════════════════════════════════════════

const ADMIN_ROLES = {
  OWNER: {
    level:        1,
    name:         'Owner / CEO',
    permissions:  ['ALL'],
    can_onboard:  true,
    trial_max_days: 15,
    can_see_all_clients: true,
    can_activate_subscriptions: true,
    can_suspend_clients: true,
    can_delete_clients: true,
    can_manage_admins: true,
    can_view_financials: true,
    can_view_fraud_alerts: true,
    can_change_system_config: true,
    sees_downliners_of: 'ALL',
  },
  SENIOR_ADMIN: {
    level:        2,
    name:         'Senior Administrator',
    permissions:  ['VIEW_ALL','ONBOARD','ACTIVATE','SUSPEND','SUPPORT'],
    can_onboard:  true,
    trial_max_days: 15,
    can_see_all_clients: true,
    can_activate_subscriptions: true,
    can_suspend_clients: true,
    can_delete_clients: false,
    can_manage_admins: false,
    can_view_financials: true,
    can_view_fraud_alerts: true,
    can_change_system_config: false,
    sees_downliners_of: 'ALL',
  },
  ADMIN: {
    level:        3,
    name:         'Administrator',
    permissions:  ['VIEW_ALL','ONBOARD','SUPPORT'],
    can_onboard:  true,
    trial_max_days: 14,
    can_see_all_clients: true,
    can_activate_subscriptions: false,
    can_suspend_clients: false,
    can_delete_clients: false,
    can_manage_admins: false,
    can_view_financials: false,
    can_view_fraud_alerts: true,
    can_change_system_config: false,
    sees_downliners_of: 'ALL',
  },
  MARKETER: {
    level:        4,
    name:         'Marketer / Sales Agent',
    permissions:  ['ONBOARD_ONLY'],
    can_onboard:  true,
    trial_max_days: 7,    // marketers can only give 7-day trials (or up to 15 with override)
    can_see_all_clients: false,  // only sees their own downliners
    can_activate_subscriptions: false,
    can_suspend_clients: false,
    can_delete_clients: false,
    can_manage_admins: false,
    can_view_financials: false,
    can_view_fraud_alerts: false,
    can_change_system_config: false,
    sees_downliners_of: 'OWN',  // only sees clients they personally onboarded
  },
  SUPPORT: {
    level:        5,
    name:         'Support Staff',
    permissions:  ['VIEW_CLIENTS','RESPOND_TICKETS'],
    can_onboard:  false,
    trial_max_days: 0,
    can_see_all_clients: true,
    can_activate_subscriptions: false,
    can_suspend_clients: false,
    can_delete_clients: false,
    can_manage_admins: false,
    can_view_financials: false,
    can_view_fraud_alerts: false,
    can_change_system_config: false,
    sees_downliners_of: 'ALL',
  },
};

function hasPermission(adminRole, action) {
  const role = ADMIN_ROLES[adminRole];
  if (!role) return false;
  if (role.permissions.includes('ALL')) return true;
  return role.permissions.includes(action);
}

function canPerform(adminRole, action) {
  const role = ADMIN_ROLES[adminRole];
  if (!role) return false;
  return role[action] === true;
}

export {  ADMIN_ROLES, hasPermission, canPerform  };
