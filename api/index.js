import app, { kernelReady, storageHydration } from "../src/app.js";

export default async function handler(req, res) {
  try {
    await Promise.all([kernelReady, storageHydration]);
    return app(req, res);
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: "KERNEL_NOT_READY",
      message: error?.message || String(error)
    });
  }
}
