export async function publicDiscovery(rawUrl) {
  const u = new URL(rawUrl); if (!['http:','https:'].includes(u.protocol)) throw new Error('Only public HTTP(S) URLs are allowed');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || /^(10\.|127\.|169\.254\.|192\.168\.)/.test(host)) throw new Error('Private/local targets are not allowed');
  const response = await fetch(u, { redirect:'follow', signal:AbortSignal.timeout(8000), headers:{'User-Agent':'ADE-Public-Discovery/1.0'} });
  const html = await response.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g,' ').trim() || null;
  const forms = (html.match(/<form\b/gi)||[]).length; const links=(html.match(/<a\b/gi)||[]).length;
  const signals=['shopify','woocommerce','odoo','wordpress','magento','salesforce','hubspot'].filter(x=>html.toLowerCase().includes(x));
  return { success:true, url:u.toString(), httpStatus:response.status, title, forms, links, technologySignals:signals, scope:'PUBLIC_ONLY', fetchedAt:new Date().toISOString() };
}
