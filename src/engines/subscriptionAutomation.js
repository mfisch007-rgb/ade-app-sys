import cron from "node-cron";
import { supabase } from "../config/supabaseClient.js";
import { checkUsageUpgrade } from "./usageBillingEngine.js";

cron.schedule("0 1 * * *", async () => {

  console.log("⏰ Nightly usage upgrade check");

  try {

    const { data, error } = await supabase
      .from("clients")
      .select("id");

    if (error) {
      console.error("Client fetch failed:", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.log("No clients found.");
      return;
    }

    for (const client of data) {

      try {
        await checkUsageUpgrade(client.id);
      } catch (err) {
        console.error(`Upgrade check failed for ${client.id}`, err.message);
      }

    }

    console.log("✅ Upgrade check finished");

  } catch (err) {

    console.error("Cron fatal error:", err.message);

  }

});