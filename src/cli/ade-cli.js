/**
 * ADE-APEX Operational Control Plane & CLI Dispatcher
 */

import { EnterpriseKernelMaster } from '../kernel/EnterpriseKernelMaster.js';
import { runAdeValidate } from './commands/validate.js';
import { runAdeDoctor } from './commands/doctor.js';
import { runAdeHealth } from './commands/health.js';
import { runAdeBenchmark } from './commands/benchmark.js';
import { runAdeTrace } from './commands/trace.js';
import { runAdeProfile } from './commands/profile.js';
import { runAdePlugins } from './commands/plugins.js';
import { runAdeLogs } from './commands/logs.js';
import { runAdeKernel } from './commands/kernel.js';

const command = process.argv[2] || 'validate';

const commands = {
  validate: runAdeValidate,
  doctor: runAdeDoctor,
  health: runAdeHealth,
  benchmark: runAdeBenchmark,
  trace: runAdeTrace,
  profile: runAdeProfile,
  plugins: runAdePlugins,
  logs: runAdeLogs,
  kernel: runAdeKernel
};

if (!commands[command]) {
  console.log(`❌ Unknown command: '${command}'`);
  console.log(`Available commands: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

await commands[command]();