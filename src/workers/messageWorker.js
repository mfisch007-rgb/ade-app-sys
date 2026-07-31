import { messageQueue } from "../queues/messageQueue.js";
import { parseMessage } from "../parsers/messageParser.js";

console.log("📦 Message worker started");

messageQueue.process(5, async (job) => {
  const { sender, text, msg } = job.data;

  try {
    return await parseMessage(sender, text, msg);
  } catch (err) {
    console.error("Worker error:", err.message);
    throw err;
  }
});
