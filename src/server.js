import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

import adminRoutes from "./routes/admin.js";
import { startWhatsApp } from "./whatsapp/whatsappClient.js";
import { guardBot } from "./system/botGuardian.js";
import { supabase } from "./config/supabaseClient.js";
import db from "./config/database.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use(rateLimit({
  windowMs:60000,
  max:120
}));

app.get("/", (req,res)=>{
  res.send("LedgerFlow Engine Online");
});

app.get("/health", async (req,res)=>{

  try{

    const dbCheck = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    res.json({
      status:"ok",
      server:"running",
      database: dbCheck.error ? "error":"connected",
      whatsapp: global.sock ? "connected":"not connected",
      time:new Date()
    });

  }catch(err){

    res.status(500).json({
      status:"error",
      error:err.message
    });

  }

});

app.use("/api/admin", adminRoutes);

app.listen(PORT, async()=>{

  console.log(`🌍 Server listening on ${PORT}`);

  try{

    await db.testConnection();

    global.sock = await startWhatsApp();

    guardBot();

    console.log("✅ LedgerFlow fully started");

  }catch(err){

    console.error("Startup error:", err.message);

  }

});