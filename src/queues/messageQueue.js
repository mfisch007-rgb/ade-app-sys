import Queue from "bull";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

export const messageQueue = new Queue("messages", {
  redis: {
    host: redis.options.host,
    port: redis.options.port,
    password: redis.options.password
  }
});

export async function addMessageJob(data) {
  await messageQueue.add(data, {
    attempts: 5,
    backoff: 5000,
    removeOnComplete: true,
    removeOnFail: true
  });
}
