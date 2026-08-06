export async function runAdeProfile() {
  console.log('================================================================================');
  console.log('   ADE-APEX MEMORY & RESOURCE PROFILER (ade profile)');
  console.log('================================================================================');
  const mem = process.memoryUsage();
  console.log(`  RSS Memory ....... ${(mem.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Total ....... ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Heap Used ........ ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  External ......... ${(mem.external / 1024 / 1024).toFixed(2)} MB`);
}