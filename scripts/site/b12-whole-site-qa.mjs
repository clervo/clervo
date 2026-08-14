#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => { const i = args.indexOf(flag); return i === -1 ? null : args[i + 1] ?? null; };
const site = path.resolve(value('--site-root') ?? path.join(root, 'apps/site/dist'));
const out = path.resolve(value('--out') ?? path.join(root, 'apps/site/qa-artifacts-final'));
const useBuilt = has('--use-built');
const captures = path.join(out, 'captures');
const dedicated = path.join(out, 'dedicated');
const contactSheets = path.join(out, 'contact-sheets');

const viewports = [
  { id: '1600', width: 1600, height: 900 },
  { id: '1024', width: 1024, height: 768 },
  { id: '390', width: 390, height: 844 },
  { id: '320', width: 320, height: 700 },
];
const routes = [
  ['home', '/'], ['start', '/start'], ['product', '/product'], ['catalog', '/catalog'],
  ['family-search', '/products/search'], ['family-ai', '/products/ai'], ['family-sandbox', '/products/sandbox'],
  ['family-rpc', '/products/rpc'], ['family-prediction', '/products/prediction'], ['family-crypto', '/products/crypto'],
  ['operation-search-web', '/operations/search.web'], ['pricing', '/pricing'], ['proof', '/proof'], ['docs', '/docs'],
  ['status', '/status'], ['security', '/security'], ['benchmarks', '/benchmarks'], ['changelog', '/changelog'], ['legal', '/legal'],
].map(([id, routePath]) => ({ id, path: routePath, support: ['/pricing','/proof','/docs','/status','/security','/benchmarks','/changelog','/legal'].includes(routePath) }));
const mime = { '.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const esc = (text) => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const address = server.address(); server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}
async function serve(port) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
      let file = path.resolve(site, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      assert(file === site || file.startsWith(`${site}${path.sep}`), 'path_traversal');
      let info; try { info = await stat(file); } catch { info = null; }
      if (info?.isDirectory() || (info === null && path.extname(file) === '')) file = path.join(file, 'index.html');
      const body = await readFile(file);
      response.writeHead(200, { 'cache-control':'no-store', 'content-type':mime[path.extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404, { 'content-type':'text/plain; charset=utf-8' }).end('not found'); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  return server;
}
async function findChrome() {
  const candidates = [process.env.CHROME_PATH,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) { try { await access(candidate, constants.X_OK); return candidate; } catch { /* next */ } }
  throw new Error('chrome_executable_missing');
}
async function fetchJson(url, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { try { const response = await fetch(url); if (response.ok) return response.json(); } catch { /* retry */ } await sleep(100); }
  throw new Error(`endpoint_timeout:${url}`);
}
async function waitForExit(child, timeout = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => { const timer = setTimeout(() => resolve(child.exitCode !== null || child.signalCode !== null), timeout); child.once('exit', () => { clearTimeout(timer); resolve(true); }); });
}
class Cdp {
  constructor(url) { this.ws = new WebSocket(url); this.id = 1; this.pending = new Map(); this.events = new Map(); }
  async open() {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('cdp_open_timeout')), 10_000); this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once:true }); this.ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp_socket_error')); }, { once:true }); });
    this.ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (message.id !== undefined) { const call = this.pending.get(message.id); if (!call) return; this.pending.delete(message.id); message.error ? call.reject(new Error(`${call.method}:${message.error.message}`)) : call.resolve(message.result ?? {}); }
      else for (const callback of this.events.get(message.method) ?? []) callback(message.params ?? {});
    });
  }
  send(method, params = {}) { const id = this.id++; return new Promise((resolve, reject) => { this.pending.set(id, { method, resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  on(method, callback) { const list = this.events.get(method) ?? []; list.push(callback); this.events.set(method, list); return () => this.events.set(method, (this.events.get(method) ?? []).filter((item) => item !== callback)); }
  once(method, timeout = 15_000) { return new Promise((resolve, reject) => { const timer = setTimeout(() => { off(); reject(new Error(`${method}_timeout`)); }, timeout); const off = this.on(method, (event) => { clearTimeout(timer); off(); resolve(event); }); }); }
  close() { this.ws.close(); }
}
async function launchChrome(port, profile) {
  const executable = await findChrome();
  const child = spawn(executable, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--disable-sync','--mute-audio','--no-first-run','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'], { stdio:'ignore' });
  const end = Date.now() + 15_000; let page;
  while (!page && Date.now() < end) { try { page = (await fetchJson(`http://127.0.0.1:${port}/json/list`, 2_000)).find(({ type }) => type === 'page'); } catch { /* retry */ } if (!page) await sleep(100); }
  assert(page?.webSocketDebuggerUrl, 'chrome_page_target_missing'); return { child, executable, ws:page.webSocketDebuggerUrl };
}
async function waitFor(cdp, expression, code, timeout = 8_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await cdp.send('Runtime.evaluate', { expression, returnByValue:true }); if (result.result?.value === true) return; await sleep(60); }
  throw new Error(`${code}_timeout`);
}
async function viewport(cdp, width, height) { await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor:1, mobile:false, screenWidth:width, screenHeight:height }); }
async function navigate(cdp, origin, routePath) {
  const loaded = cdp.once('Page.loadEventFired'); const navigation = await cdp.send('Page.navigate', { url:`${origin}${routePath}` }); assert(!navigation.errorText, `navigation_failed:${routePath}:${navigation.errorText}`); await loaded;
  await cdp.send('Runtime.evaluate', { expression:'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise:true, returnByValue:true });
  await waitFor(cdp, `document.querySelector('#main-content') instanceof HTMLElement`, `main_missing:${routePath}`); await sleep(80);
}
async function shot(cdp, file, fullPage = false) {
  let params = { format:'png', fromSurface:true, captureBeyondViewport:false };
  if (fullPage) { const layout = await cdp.send('Page.getLayoutMetrics'); const size = layout.cssContentSize ?? layout.contentSize; params = { format:'png', fromSurface:true, captureBeyondViewport:true, clip:{ x:0,y:0,width:size.width,height:size.height,scale:1 } }; }
  const image = await cdp.send('Page.captureScreenshot', params); await writeFile(file, Buffer.from(image.data, 'base64'));
}
async function audit(cdp, route, vp) {
  const evaluated = await cdp.send('Runtime.evaluate', { expression:`(() => {
    const de=document.documentElement, body=document.body;
    const visible=(e)=>{if(!(e instanceof HTMLElement||e instanceof SVGElement))return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>.01&&r.width>0&&r.height>0};
    const box=(e)=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
    const header=document.querySelector('.site-header'),brand=document.querySelector('.site-header__brand'),mark=document.querySelector('.site-header__brand .apex-mark'),word=document.querySelector('.site-header__wordmark'),cta=document.querySelector('.site-header__cta'),menu=document.querySelector('.site-header__menu'),subnav=document.querySelector('.s6-subnav');
    const controls=[...document.querySelectorAll('button,select,a.button,a.b12-button,a.s6-button')].filter(visible).map((e)=>({label:e.getAttribute('aria-label')||e.textContent?.trim().slice(0,70)||e.tagName,...box(e)}));
    return{scrollWidth:Math.max(de.scrollWidth,body.scrollWidth),clientWidth:de.clientWidth,horizontalOverflow:Math.max(de.scrollWidth,body.scrollWidth)>de.clientWidth+1,header:header&&visible(header)?{...box(header),position:getComputedStyle(header).position}:null,brand:brand&&visible(brand)?box(brand):null,mark:mark&&visible(mark)?box(mark):null,word:word&&visible(word)?{text:word.textContent?.trim()??'',transform:getComputedStyle(word).textTransform,size:getComputedStyle(word).fontSize,weight:getComputedStyle(word).fontWeight,spacing:getComputedStyle(word).letterSpacing}:null,cta:cta?{visible:visible(cta),...box(cta)}:null,menu:menu?{visible:visible(menu),...box(menu)}:null,subnav:subnav&&visible(subnav)?{...box(subnav),position:getComputedStyle(subnav).position}:null,smallControls:controls.filter(({width,height})=>width<44||height<44)};
  })()`, returnByValue:true });
  const data = evaluated.result.value; const issues=[];
  if (data.horizontalOverflow) issues.push(`horizontal_overflow:${data.scrollWidth}/${data.clientWidth}`);
  if (!data.header || !data.brand || !data.mark || !data.word) issues.push('header_identity_missing');
  if (data.mark && (data.mark.width < 15 || data.mark.height < 15)) issues.push(`apex_below_minimum:${Math.round(data.mark.width)}x${Math.round(data.mark.height)}`);
  if (vp.width <= 900 && !data.menu?.visible) issues.push('mobile_menu_missing');
  if (route.support && data.word?.transform !== 'uppercase') issues.push(`support_wordmark_not_uppercase:${data.word?.transform ?? 'missing'}`);
  return { ...data, issues };
}
async function supportSticky(cdp) {
  const evaluated = await cdp.send('Runtime.evaluate', { expression:`(() => {const rail=document.querySelector('.s6-subnav');if(!(rail instanceof HTMLElement))return null;scrollTo(0,Math.min(900,Math.max(0,document.documentElement.scrollHeight-innerHeight)));const rr=rail.getBoundingClientRect(),h=document.querySelector('.site-header'),hr=h?.getBoundingClientRect(),hv=!!hr&&hr.bottom>0&&hr.top<innerHeight;return{top:rr.top,bottom:rr.bottom,visible:rr.bottom>0&&rr.top<innerHeight,headerVisible:hv,overlap:hv&&hr.bottom>rr.top+1}})()`, returnByValue:true }); await sleep(80); return evaluated.result.value;
}
async function clickText(cdp, selector, text) {
  const evaluated = await cdp.send('Runtime.evaluate', { expression:`(() => {const t=${JSON.stringify(text)};const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find((n)=>n.textContent?.trim()===t);if(!(e instanceof HTMLElement))return false;e.click();return true})()`, returnByValue:true });
  assert(evaluated.result?.value === true, `click_target_missing:${text}`);
}
async function openMenu(cdp) { await clickText(cdp, '.site-header__menu', ''); await waitFor(cdp, `document.querySelector('.mobile-nav')?.hidden === false`, 'menu_not_open'); }

function sheet(viewportId, items) {
  const vp = viewports.find(({ id }) => id === viewportId); const mobile = viewportId !== '1600'; const cols = mobile ? 4 : 3; const iw = mobile ? 195 : 500; const ih = Math.round(iw * vp.height / vp.width); const tw = iw + 15, th = ih + 42; const rows=Math.ceil(items.length/cols), width=cols*tw+20, height=rows*th+20;
  const body=items.map((item,index)=>{const x=10+(index%cols)*tw,y=10+Math.floor(index/cols)*th;return`<g transform="translate(${x} ${y})"><rect width="${iw}" height="${ih}" fill="#050505" stroke="#2a2a2a"/><image href="../captures/${esc(item.file)}" width="${iw}" height="${ih}"/><text x="0" y="${ih+23}" fill="#f5f5f5" font-family="monospace" font-size="12">${esc(item.label)}</text></g>`}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#000"/>${body}</svg>`;
}

assert(typeof WebSocket === 'function', 'node_websocket_unavailable'); await rm(out,{recursive:true,force:true}); await mkdir(captures,{recursive:true}); await mkdir(dedicated,{recursive:true}); await mkdir(contactSheets,{recursive:true});
let build={command:'npm run build --workspace @clervo/site',skipped:useBuilt,exitCode:null};
if(!useBuilt){const npm=process.platform==='win32'?'npm.cmd':'npm';const result=spawnSync(npm,['run','build','--workspace','@clervo/site'],{cwd:root,encoding:'utf8'});build={...build,exitCode:result.status};await writeFile(path.join(out,'build.log'),`${result.stdout??''}${result.stderr??''}`);assert(result.status===0,`site_build_failed:${result.status}`)}
await access(site,constants.R_OK);
const webPort=await freePort(),debugPort=await freePort(),profile=await mkdtemp(path.join(os.tmpdir(),'clervo-b12-final-')),server=await serve(webPort),origin=`http://127.0.0.1:${webPort}`;
let browser,cdp;const results=[],globalIssues=[],stateResults=[];
try{
  browser=await launchChrome(debugPort,profile);cdp=new Cdp(browser.ws);await cdp.open();await Promise.all(['Page.enable','Runtime.enable','Log.enable'].map((m)=>cdp.send(m)));
  let consoleErrors=[],pageErrors=[];cdp.on('Runtime.consoleAPICalled',({type,args:vals})=>{if(type==='error')consoleErrors.push(vals.map(({value:v,description})=>v??description??'').join(' '))});cdp.on('Log.entryAdded',({entry})=>{if(entry.level==='error')consoleErrors.push(entry.text)});cdp.on('Runtime.exceptionThrown',({exceptionDetails})=>pageErrors.push(exceptionDetails.exception?.description??exceptionDetails.text??'runtime_exception'));
  for(const vp of viewports){await viewport(cdp,vp.width,vp.height);for(const route of routes){consoleErrors=[];pageErrors=[];await navigate(cdp,origin,route.path);await cdp.send('Runtime.evaluate',{expression:'scrollTo(0,0)'});const diag=await audit(cdp,route,vp);let sticky=null;if(route.support){sticky=await supportSticky(cdp);if(sticky===null||!sticky.visible||sticky.top<-1||sticky.overlap)diag.issues.push(`support_subnav_bad:${JSON.stringify(sticky)}`);await cdp.send('Runtime.evaluate',{expression:'scrollTo(0,0)'})}const file=`${vp.id}--${route.id}.png`;await shot(cdp,path.join(captures,file));const ce=[...new Set(consoleErrors)],pe=[...new Set(pageErrors)],issues=[...diag.issues,...ce.map((e)=>`console:${e}`),...pe.map((e)=>`page:${e}`)];results.push({viewport:vp.id,width:vp.width,height:vp.height,route:route.path,routeId:route.id,file,diagnostics:diag,sticky,consoleErrors:ce,pageErrors:pe,issues})}}

  await viewport(cdp,390,844);for(const [routePath,name] of [['/operations/search.web','long-operation-390-full.png'],['/legal','long-legal-390-full.png']]){await navigate(cdp,origin,routePath);await shot(cdp,path.join(dedicated,name),true)}

  await navigate(cdp,origin,'/pricing');await openMenu(cdp);await shot(cdp,path.join(dedicated,'mobile-menu-open-390.png'));await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,nativeVirtualKeyCode:27});await waitFor(cdp,`document.querySelector('.mobile-nav')?.hidden === true`,'menu_escape_not_closed');stateResults.push('mobile-menu-escape:pass');

  await viewport(cdp,760,800);await navigate(cdp,origin,'/pricing');await openMenu(cdp);await shot(cdp,path.join(dedicated,'mobile-menu-backdrop-before-760.png'));await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:20,y:400,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:20,y:400,button:'left',clickCount:1});try{await waitFor(cdp,`document.querySelector('.mobile-nav')?.hidden === true`,'menu_backdrop_not_closed',2000);stateResults.push('mobile-menu-backdrop:pass')}catch{globalIssues.push('mobile_menu_backdrop_close_failed')}await shot(cdp,path.join(dedicated,'mobile-menu-backdrop-after-760.png'));

  await viewport(cdp,390,844);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await navigate(cdp,origin,'/product');await clickText(cdp,'button','Run fixture');await waitFor(cdp,`document.querySelector('.b12-product')?.getAttribute('data-router-state') === 'verified'`,'product_verified_not_reached',2000);await shot(cdp,path.join(dedicated,'semantic-product-verified-390.png'));stateResults.push('product-verified-reduced-motion:pass');await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});

  await navigate(cdp,origin,'/operations/search.web');await clickText(cdp,'button','Approve fixture boundary');await clickText(cdp,'button','Execute fixture');await waitFor(cdp,`document.querySelector('.b12-operation')?.getAttribute('data-execution-state') === 'verified'`,'operation_verified_not_reached',5000);await shot(cdp,path.join(dedicated,'operation-proof-390.png'));stateResults.push('operation-proof:pass');await clickText(cdp,'button','Unresolved');await clickText(cdp,'button','Execute fixture');await waitFor(cdp,`document.querySelector('.b12-operation')?.getAttribute('data-execution-state') === 'unresolved'`,'operation_unresolved_not_reached',5000);await shot(cdp,path.join(dedicated,'operation-unresolved-390.png'));stateResults.push('operation-unresolved:pass');

  await navigate(cdp,origin,'/pricing');await clickText(cdp,'button','Preview approval boundary');await waitFor(cdp,`document.querySelector('.s6-quote-shell')?.getAttribute('data-quote-state') === 'approved'`,'pricing_approved_not_reached');await cdp.send('Runtime.evaluate',{expression:`document.querySelector('.s6-quote-shell')?.scrollIntoView({block:'center',behavior:'instant'})`});await shot(cdp,path.join(dedicated,'semantic-pricing-approved-390.png'));stateResults.push('pricing-approved:pass');await clickText(cdp,'button','Preview refusal');await waitFor(cdp,`document.querySelector('.s6-quote-shell')?.getAttribute('data-quote-state') === 'refused'`,'pricing_refused_not_reached');await shot(cdp,path.join(dedicated,'semantic-pricing-refused-390.png'));stateResults.push('pricing-refused:pass');

  await navigate(cdp,origin,'/proof');await shot(cdp,path.join(dedicated,'proof-lab-390.png'));stateResults.push('proof-lab-route:pass');
  await navigate(cdp,origin,'/status');const statusUnbound=(await cdp.send('Runtime.evaluate',{expression:`/not bound/i.test(document.body.innerText)`,returnByValue:true})).result?.value===true;if(!statusUnbound)globalIssues.push('status_unbound_state_not_visible');else stateResults.push('status-unbound:pass');await shot(cdp,path.join(dedicated,'status-unbound-390.png'));
  await navigate(cdp,origin,'/benchmarks');const benchmarkEmpty=(await cdp.send('Runtime.evaluate',{expression:`/No public benchmark workload is bound/i.test(document.body.innerText)`,returnByValue:true})).result?.value===true;if(!benchmarkEmpty)globalIssues.push('benchmarks_empty_state_not_visible');else stateResults.push('benchmarks-empty:pass');await shot(cdp,path.join(dedicated,'benchmarks-empty-390.png'));
  await navigate(cdp,origin,'/legal');const legalStructural=(await cdp.send('Runtime.evaluate',{expression:`/structural authority only/i.test(document.body.innerText)`,returnByValue:true})).result?.value===true;if(!legalStructural)globalIssues.push('legal_structural_state_not_visible');else stateResults.push('legal-structural:pass');await shot(cdp,path.join(dedicated,'legal-structural-390.png'));
}finally{try{cdp?.close()}catch{}const child=browser?.child;if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');if(!(await waitForExit(child))){child.kill('SIGKILL');await waitForExit(child)}}await new Promise((resolve)=>server.close(resolve));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200})}

for(const id of ['1600','390','320']){const items=results.filter((r)=>r.viewport===id).map((r)=>({label:r.routeId,file:r.file}));await writeFile(path.join(contactSheets,`whole-site-${id}.svg`),sheet(id,items))}
const routeIssues=results.flatMap((r)=>r.issues.map((issue)=>`${r.viewport}:${r.route}:${issue}`));const issues=[...routeIssues,...globalIssues];
const report={build,routeCount:routes.length,viewportCount:viewports.length,captureCount:results.length,viewports,routes,results,stateResults,globalIssues,issues};await writeFile(path.join(out,'report.json'),`${JSON.stringify(report,null,2)}\n`);
const summary=['# B12 Final Whole-Site Visual QA','',`- routes: ${routes.length}`,`- viewport captures: ${results.length}`,`- viewports: ${viewports.map(({width,height})=>`${width}×${height}`).join(', ')}`,`- meaningful states: ${stateResults.length}`,`- issues: ${issues.length}`,'','## Result','',issues.length===0?'PASS':'FAIL','',...(issues.length?['## Issues','',...issues.map((i)=>`- ${i}`)]:[])].join('\n');await writeFile(path.join(out,'summary.md'),`${summary}\n`);
const warnings=results.flatMap((r)=>r.diagnostics.smallControls.map((c)=>`${r.viewport}:${r.route}:${c.label}:${Math.round(c.width)}x${Math.round(c.height)}`));await writeFile(path.join(out,'control-target-review.txt'),`${warnings.length?warnings.join('\n'):'No visible button/select/primary-link targets below 44px detected.'}\n`);
const ledger=['# Final hardening finding ledger','','## MUST FIX corrected','- Slice 6 trust/support routes inherited the pre-B12 shared shell, causing a cross-page identity mismatch, hidden phone setup CTA, and sticky shell/subnav conflict risk. Corrected only at the shared shell boundary.','- Global mobile navigation lacked backdrop close. Added backdrop close with focus return.','','## LEAVE ALONE','- Canonical Hollow Apex geometry and generated identity source.','- Approved Hero, Homepage, Start, Product/Catalog, Operation, and trust/support page compositions.','- Product registry, pricing, payment/x402, supplier logic, runtime, APIs, commercial policy, and discovery authority.','','## QA',`- ${issues.length===0?'No automated visual/interaction regression flags.':`${issues.length} automated flags remain.`}`].join('\n');await writeFile(path.join(out,'finding-ledger.md'),`${ledger}\n`);
console.log(summary);if(issues.length)process.exitCode=1;
