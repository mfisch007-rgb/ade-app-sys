export const log = {
  info: (m) =>
    console.log(`[INFO] ${new Date().toISOString()} | ${m}`),

  warn: (m) =>
    console.warn(`[WARN] ${new Date().toISOString()} | ${m}`),

  error: (m) =>
    console.error(`[ERROR] ${new Date().toISOString()} | ${m}`),
};
