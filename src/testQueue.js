import "dotenv/config";

import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL);

const queue = new Queue("ade-test", {
  connection,
});

async function run() {

  try {

    console.log("Adding test jobs...");

    for (let i = 0; i < 5; i++) {

      await queue.add("sample-job", {
        value: i,
      });

      console.log("Queued:", i);
    }

    console.log("QUEUE TEST SUCCESS");

    process.exit(0);

  } catch (err) {

    console.error("QUEUE FAILURE:", err.message);

    process.exit(1);

  }
}

run();