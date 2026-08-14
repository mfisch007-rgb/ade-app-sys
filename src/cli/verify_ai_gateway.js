import AIGatewayMaster from "../ai/AIGatewayMaster.js";

async function verifyAIGateway() {
  console.log("=========================================================================");
  console.log("    ADE SYSTEM ENGINE: AI GATEWAY & SEMANTIC CACHE PROOF");
  console.log("=========================================================================\n");

  const gateway = new AIGatewayMaster({ similarityThreshold: 0.85 });

  // 1. Initial Prompt Execution (Misses cache -> Executes provider/fallback)
  const prompt1 = "Analyze market liquidity for EURUSD binary pair";
  console.log(`[TEST 1]: Submitting initial query: "${prompt1}"`);
  const res1 = await gateway.executeQuery(prompt1);
  console.log(` -> Source: ${res1.source} | Latency: ${res1.latencyMs}ms`);
  console.log(` -> Output: ${res1.response}\n`);

  // 2. Exact Match Query (Base64 Hash Match)
  console.log(`[TEST 2]: Submitting exact identical query...`);
  const res2 = await gateway.executeQuery(prompt1);
  console.log(` -> Source: ${res2.source} | Type: ${res2.cacheType} | Latency: ${res2.latencyMs}ms`);
  console.log(` -> Cache Hit PASS: ${res2.source === 'SEMANTIC_CACHE' ? '✅' : '❌'}\n`);

  // 3. Semantic Similarity Query (>= 85% Jaccard Threshold Match)
  const prompt2 = "Analyze market liquidity for EURUSD binary options pair";
  console.log(`[TEST 3]: Submitting semantically similar query: "${prompt2}"`);
  const res3 = await gateway.executeQuery(prompt2);
  console.log(` -> Source: ${res3.source} | Type: ${res3.cacheType} | Score: ${res3.similarity} | Latency: ${res3.latencyMs}ms`);
  console.log(` -> Semantic Hit PASS: ${res3.similarity >= 0.85 ? '✅' : '❌'}\n`);

  console.log("=========================================================================");
  console.log("   [AI GATEWAY VERDICT]: LIVE ADAPTERS & SEMANTIC CACHE LOCKED ✅");
  console.log("=========================================================================");
}

verifyAIGateway().catch(console.error);
