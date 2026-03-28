import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

setInterval(async()=>{

  try{

    await redis.ping()

    console.log("🟢 Redis OK")

  }catch{

    console.error("🔴 Redis connection lost")

  }

},10000)