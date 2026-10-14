import('./src/app.js').then(async () => {
  const { default: app } = await import('./src/app.js');
  // workforce is exported from app.js
  const workforce = (await import('./src/app.js')).workforce || (await import('./src/identity/WorkforceManager.js')).default;
  console.log('trying');
});
