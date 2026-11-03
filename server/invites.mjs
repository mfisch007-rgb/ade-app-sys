export function generateInvitation({ fullName, role, level, days }) {
    const validLevels = ["L0", "L1", "L2", "L3", "L4"];
    const assignedLevel = validLevels.includes(level) ? level : "L1";
    return {
        code: "INV-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        fullName,
        role: role || "OPERATOR",
        level: assignedLevel,
        expiresInDays: days || 7,
        createdAt: new Date().toISOString(),
        status: "PENDING_ACTIVATION"
    };
}
