import { startWhatsApp } from "../whatsapp/whatsappClient.js";
import { supabase } from "../config/supabaseClient.js";

console.log("🔎 Running system check...\n");

/* DATABASE TEST */

async function testDatabase(){

  try{

    const { data, error } = await supabase
      .from("clients")
      .select("id")
      .limit(1);

    if(error) throw error;

    console.log("✅ Database connection OK");

  }catch(err){

    console.log("❌ Database connection FAILED:",err.message);

  }

}

/* WHATSAPP TEST */

async function testWhatsApp(){

  try{

    await startWhatsApp();

    console.log("✅ WhatsApp engine started");

  }catch(err){

    console.log("❌ WhatsApp failed:",err.message);

  }

}

/* RUN TEST */

async function run(){

  await testDatabase();

  await testWhatsApp();

  console.log("\n🏁 System test finished");

}

run();