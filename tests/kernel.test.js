import { runKernelSuite } from './bus.test.js';
import { runEnginesSuite } from './engines.test.js';
import { runEcosystemSuite } from './ecosystem.test.js';

async function runAllTests() {
  console.log('==================================================');
  console.log('   ADE-APEX ENTERPRISE INTEGRATION TEST SUITE   ');
  console.log('==================================================\n');

  let totalPassed = 0, totalFailed = 0;
  const suites = [
    { name: 'Enterprise Event Bus Isolation', runner: runKernelSuite },
    { name: 'Core Intelligence & Security Engines', runner: runEnginesSuite },
    { name: 'Ecosystem & Platform Modules', runner: runEcosystemSuite }
  ];

  for (const suite of suites) {
    console.log('\n[RUNNING SUITE] ' + suite.name);
    try {
      const results = await suite.runner();
      totalPassed+= results.passed;
      totalFailed+= results.failed;
    } catch (err) {
      console.error('[SUITE CRASH] ' + suite.name);
      console.error(err);
      totalFailed++;
    }
  }

  console.log('\n==================================================');
  console.log(' TEST SUMMARY: ' + totalPassed + ' Passed | ' + totalFailed + ' Failed');
  console.log('==================================================');
  process.exit(totalFailed > 0 ? 1 : 0);
}

runAllTests();