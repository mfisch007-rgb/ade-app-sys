import { spawn } from 'child_process';

export async function runAdeServer() {
  console.log('================================================================================');
  console.log('   STARTING ADE-APEX ENTERPRISE API GATEWAY (ade server)');
  console.log('================================================================================');
  
  const child = spawn('node', ['src/gateway/api-server.js'], { stdio: 'inherit' });
  
  child.on('exit', (code) => {
    console.log(`[Server Process Exited with code ${code}]`);
  });
}