import { redis } from "../eventBus/eventBus.js"

async function startWorker(){

let lastId = "0"

while(true){

const res = await redis.xread(
"BLOCK",0,
"STREAMS",
"ledgerflow_stream",
lastId
)

if(!res) continue

const [, messages] = res[0]

for(const [id, fields] of messages){

lastId = id

const eventType = fields[1]
const data = JSON.parse(fields[3] || "{}")

console.log("Event:",eventType,data)

}

}

}

startWorker()
