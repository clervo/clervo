#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1] ?? fallback; };
const site = path.resolve(arg('--site-root', path.join(root, 'apps/site/dist')));
const out = path.resolve(arg('--out', path.join(root, 'apps/site/qa-artifacts-final/owner-evidence')));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (ok, code) => { if (!ok) throw new Error(code); };
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2' };

async function freePort() { return new Promise((resolve, reject) => { const s=net.createServer().once('error',reject).listen(0,'127.0.0.1',()=>{const a=s.address();s.close((e)=>e?reject(e):resolve(a.port))}); }); }
async function serve(port) {
  const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url??'/',`http://127.0.0.1:${port}`);let file=path.resolve(site,decodeURIComponent(url.pathname).replace(/^\/+/,''));assert(file===site||file.startsWith(`${site}${path.sep}`),'path_traversal');let info;try{info=await stat(file)}catch{info=null}if(info?.isDirectory()||(info===null&&path.extname(file)===''))file=path.join(file,'index.html');const body=await readFile(file);res.writeHead(200,{'cache-control':'no-store','content-type':mime[path.extname(file)]??'application/octet-stream'});res.end(body)}catch{res.writeHead(404).end('not found')}});
  await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve)); return server;
}
async function chromePath() { for(const p of [process.env.CHROME_PATH,'/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean)){try{await access(p,constants.X_OK);return p}catch{}}throw new Error('chrome_missing'); }
async function json(url, timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{const r=await fetch(url);if(r.ok)return r.json()}catch{}await sleep(100)}throw new Error(`timeout:${url}`)}
class Cdp{
  constructor(url){this.ws=new WebSocket(url);this.id=1;this.pending=new Map;this.events=new Map}
  async open(){await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('cdp_open_timeout')),8000);this.ws.addEventListener('open',()=>{clearTimeout(t);resolve()},{once:true});this.ws.addEventListener('error',()=>{clearTimeout(t);reject(new Error('cdp_error'))},{once:true})});this.ws.addEventListener('message',({data})=>{const m=JSON.parse(String(data));if(m.id!==undefined){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result??{})}else for(const f of this.events.get(m.method)??[])f(m.params??{})})}
  send(method,params={}){const id=this.id++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}
  on(method,fn){const a=this.events.get(method)??[];a.push(fn);this.events.set(method,a);return()=>this.events.set(method,(this.events.get(method)??[]).filter((x)=>x!==fn))}
  once(method,timeout=12000){return new Promise((resolve,reject)=>{const t=setTimeout(()=>{off();reject(new Error(`${method}_timeout`))},timeout);const off=this.on(method,(e)=>{clearTimeout(t);off();resolve(e)})})}
  close(){this.ws.close()}
}
async function launch(port, profile){const bin=await chromePath();const child=spawn(bin,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--hide-scrollbars',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});const end=Date.now()+12000;let page;while(!page&&Date.now()<end){try{page=(await json(`http://127.0.0.1:${port}/json/list`,1500)).find((x)=>x.type==='page')}catch{}if(!page)await sleep(100)}assert(page?.webSocketDebuggerUrl,'target_missing');return{child,ws:page.webSocketDebuggerUrl}}
async function wait(cdp, expr, code, timeout=6000){const end=Date.now()+timeout;while(Date.now()<end){const r=await cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r.result?.value===true)return;await sleep(50)}throw new Error(`${code}_timeout`)}
async function size(cdp,w,h){await cdp.send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:false,screenWidth:w,screenHeight:h})}
async function go(cdp,origin,p){const loaded=cdp.once('Page.loadEventFired');const n=await cdp.send('Page.navigate',{url:`${origin}${p}`});assert(!n.errorText,`navigate:${p}`);await loaded;await cdp.send('Runtime.evaluate',{expression:'document.fonts ? document.fonts.ready.then(()=>true) : true',awaitPromise:true});await wait(cdp,`document.querySelector('#main-content') instanceof HTMLElement`,'main_missing')}
async function shot(cdp,name){const r=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(path.join(out,name),Buffer.from(r.data,'base64'))}
async function click(cdp,text){const r=await cdp.send('Runtime.evaluate',{expression:`(()=>{const t=${JSON.stringify(text)},e=[...document.querySelectorAll('button')].find((x)=>x.textContent?.trim()===t);if(!(e instanceof HTMLElement))return false;e.click();return true})()`,returnByValue:true});assert(r.result?.value===true,`button_missing:${text}`)}
async function center(cdp,selector){await cdp.send('Runtime.evaluate',{expression:`(()=>{document.documentElement.style.scrollBehavior='auto';document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'});return true})()`});await sleep(100)}

await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});await access(site,constants.R_OK);assert(typeof WebSocket==='function','websocket_missing');
const wp=await freePort(),dp=await freePort(),profile=await mkdtemp(path.join(os.tmpdir(),'b12-owner-evidence-')),server=await serve(wp),origin=`http://127.0.0.1:${wp}`;let browser,cdp;const checks=[];
try{
  browser=await launch(dp,profile);cdp=new Cdp(browser.ws);await cdp.open();await Promise.all(['Page.enable','Runtime.enable'].map((m)=>cdp.send(m)));

  // Corrected trust shell at the exact top of the page.
  await size(cdp,390,844);for(const p of ['/pricing','/proof']){await go(cdp,origin,p);await cdp.send('Runtime.evaluate',{expression:`document.documentElement.style.scrollBehavior='auto';scrollTo({top:0,left:0,behavior:'instant'})`});await wait(cdp,'scrollY < 1','top_not_reached');await shot(cdp,`trust-shell-${p.slice(1)}-390.png`)}

  // Sticky support rail after actual scrolling: header must be gone and rail must occupy top without overlap.
  await go(cdp,origin,'/pricing');await cdp.send('Runtime.evaluate',{expression:`document.documentElement.style.scrollBehavior='auto';scrollTo({top:900,left:0,behavior:'instant'})`});await wait(cdp,'scrollY > 500','support_scroll_not_reached');const sticky=(await cdp.send('Runtime.evaluate',{expression:`(()=>{const r=document.querySelector('.s6-subnav')?.getBoundingClientRect(),h=document.querySelector('.site-header')?.getBoundingClientRect();return r&&h?{railTop:r.top,railBottom:r.bottom,headerTop:h.top,headerBottom:h.bottom,headerVisible:h.bottom>0&&h.top<innerHeight,overlap:h.bottom>r.top&&h.top<r.bottom}:null})()`,returnByValue:true})).result?.value;assert(sticky&&sticky.railTop>=-1&&sticky.railTop<=1&&!sticky.headerVisible&&!sticky.overlap,`support_sticky_bad:${JSON.stringify(sticky)}`);checks.push({name:'support-sticky-after-scroll',result:'pass',detail:sticky});await shot(cdp,'support-rail-sticky-pricing-390.png');

  // Verified product visual, centered on the mechanism/status rather than the page top.
  await go(cdp,origin,'/product');await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await click(cdp,'Run fixture');await wait(cdp,`document.querySelector('.b12-product')?.dataset.routerState === 'verified'`,'product_verified');await center(cdp,'.s4-router-visual');await shot(cdp,'semantic-product-verified-centered-390.png');checks.push({name:'product-verified',result:'pass'});await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});

  // Verified and unresolved operation states, centered on the execution pipeline.
  await go(cdp,origin,'/operations/search.web');await click(cdp,'Approve fixture boundary');await click(cdp,'Execute fixture');await wait(cdp,`document.querySelector('.b12-operation')?.dataset.executionState === 'verified'`,'operation_verified');await center(cdp,'#s5-execution');await shot(cdp,'operation-verified-centered-390.png');checks.push({name:'operation-verified',result:'pass'});await click(cdp,'Unresolved');await click(cdp,'Execute fixture');await wait(cdp,`document.querySelector('.b12-operation')?.dataset.executionState === 'unresolved'`,'operation_unresolved');await center(cdp,'#s5-execution');await shot(cdp,'operation-unresolved-centered-390.png');checks.push({name:'operation-unresolved',result:'pass'});

  // Owner-funded proof record centered so verified-gold semantics are directly reviewable.
  await go(cdp,origin,'/proof');await center(cdp,'.s6-proof-record--owner');const owner=(await cdp.send('Runtime.evaluate',{expression:`document.querySelector('.s6-proof-record--owner')?.dataset.proof === 'verified'`,returnByValue:true})).result?.value===true;assert(owner,'owner_proof_not_verified');await shot(cdp,'proof-owner-record-centered-390.png');checks.push({name:'proof-owner-record',result:'pass'});

  await writeFile(path.join(out,'checks.json'),`${JSON.stringify(checks,null,2)}\n`);await writeFile(path.join(out,'summary.md'),`# Focused owner evidence\n\n${checks.map((c)=>`- ${c.name}: ${c.result}`).join('\n')}\n`);
}finally{try{cdp?.close()}catch{}const child=browser?.child;if(child&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await sleep(250);if(child.exitCode===null)child.kill('SIGKILL')}await new Promise((resolve)=>server.close(resolve));await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
