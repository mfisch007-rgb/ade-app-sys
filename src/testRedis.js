import "dotenv/config";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

async function test() {

  try {

    console.log("Testing Redis...");

    await redis.set("ade:test", "CONNECTED");

    const value = await redis.get("ade:test");

    console.log("REDIS STATUS:", value);

    process.exit(0);

  } catch (err) {

    console.error("REDIS FAILURE:", err.message);

    process.exit(1);

  }
}

test();