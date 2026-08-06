import { EnterpriseKernelMaster } from '../../kernel/EnterpriseKernelMaster.js';

export async function runAdeBenchmark() {
  console.log('================================================================================');
  console.log('   ADE-APEX RUNTIME BENCHMARK SUITE (ade benchmark)');
  console.log('================================================================================');
  const iterations = 50;
  const timings = [];

  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    const kernel = new EnterpriseKernelMaster();
    await kernel.boot();
    await kernel.shutdown();
    timings.push(Date.now() - start);
  }

  const avg = timings.reduce((a, b) => a + b, 0) / iterations;
  console.log(`[Benchmark] Completed ${iterations} Kernel Boot/Shutdown Cycles.`);
  console.log(`[Benchmark] Average Lifecycle Latency: ${avg.toFixed(2)} ms`);
}