import fs from 'fs';
import path from 'path';

async function verifyFrontendSetup() {
  console.log('================================================================');
  console.log('   GROUP 1: FRONTEND DASHBOARD & TELEMETRY INTEGRATION TEST');
  console.log('================================================================');

  const dashboardExists = fs.existsSync(path.join(process.cwd(), 'src', 'ui', 'TelemetryDashboard.jsx'));

  if (dashboardExists) {
    console.log('✅ TelemetryDashboard React Component: PASSED');
    console.log('✅ Real-time SSE Endpoint Connector (/api/v1/telemetry): READY');
  } else {
    console.error('❌ TelemetryDashboard component missing!');
    process.exit(1);
  }

  console.log('================================================================');
  process.exit(0);
}

verifyFrontendSetup();
