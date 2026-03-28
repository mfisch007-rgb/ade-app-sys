import IORedis from "ioredis";

export const redis = new IORedis(process.env.REDIS_URL);

export async function publishEvent(type,data){

  try{

    await redis.xadd(
      "ledgerflow_stream",
      "*",
      "type",
      type,
      "data",
      JSON.stringify(data)
    );

  }catch(err){

    console.error("Event publish error:",err.message);

  }

}