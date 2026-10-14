const PROD='https://ade-apex-community.vercel.app';
(async()=>{
  const r=await fetch(PROD+'/');
  const t=await r.text();
  console.log('GET /',r.status, r.headers.get('content-type'), 'len',t.length);
  console.log('contains id="root":', t.includes('id="root"'));
  console.log('contains React:', t.includes('React'));
  const idx=t.indexOf('id="root"');
  if(idx>=0) console.log(t.slice(idx-80, idx+200).replace(/\n/g,' '));
  const scripts=[...t.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]);
  console.log('scripts',scripts);
  const links=[...t.matchAll(/<link[^>]*href="([^"]+)"/g)].map(m=>m[1]);
  console.log('links',links.slice(0,10));
  for(const p of ['/founder','/admin']){
    const r2=await fetch(PROD+p);
    const t2=await r2.text();
    console.log(p, r2.status, (r2.headers.get('content-type')||'').slice(0,30), t2.slice(0,200).replace(/\n/g,' ').slice(0,200));
  }
  // check API not swallowed
  const r3=await fetch(PROD+'/api/v1/health');
  console.log('/api/v1/health',r3.status, (await r3.text()).slice(0,200));
  const r4=await fetch(PROD+'/api/unknown-xyz');
  console.log('/api/unknown-xyz',r4.status,(await r4.text()).slice(0,200));
})()
