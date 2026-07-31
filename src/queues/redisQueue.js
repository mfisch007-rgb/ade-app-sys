import { Queue } from "bullmq"
import IORedis from "ioredis"

export const connection = new IORedis(process.env.REDIS_URL)

export const messageQueue = new Queue("messages", {
  connection
})

export async function addMessageJob(data){

  await messageQueue.add(
    "process-message",
    data,
    {
      attempts:5,
      backoff:{
        type:"exponential",
        delay:5000
      },
      removeOnComplete:true
    }
  )

}
