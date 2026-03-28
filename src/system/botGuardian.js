import { startWhatsApp } from "../whatsapp/whatsappClient.js";

let restarting = false;

export function guardBot(){

  setInterval(async ()=>{

    if(!global.sock && !restarting){

      restarting = true;

      console.log("⚠ WhatsApp socket missing. Restarting bot...");

      try{

        global.sock = await startWhatsApp();

        console.log("✅ WhatsApp restarted");

      }catch(err){

        console.error("Restart failed:",err.message);

      }

      restarting = false;

    }

  },15000);

}