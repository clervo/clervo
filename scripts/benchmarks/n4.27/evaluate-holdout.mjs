#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../../', import.meta.url);
const baseUrl = process.env.CLERVO_N427_BASE_URL ?? 'http://127.0.0.1:18080';
const outputRoot = new URL('docs/evidence/n4.27/holdout-final/', root);
const markerUrl = new URL('benchmarks/n4.27/holdout-final-run.v1.json', root);
const corpus = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-corpus.v1.json', root)));
const labelFile = JSON.parse(await readFile(new URL('benchmarks/n4.27/holdout-labels.v1.json', root)));
const freeze = JSON.parse(await readFile(new URL('benchmarks/n4.27/implementation-freeze.v1.json', root)));
const labels = new Map(labelFile.labels.map(([id, urls, terms, grade]) => [id, { urls, terms, grade }]));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
try { await readFile(markerUrl); throw new Error('final_holdout_already_executed'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
for (const file of freeze.files) if (sha256(await readFile(new URL(file.path, root))) !== file.sha256) throw new Error(`implementation_freeze_drift:${file.path}`);

const cases = [
  { id:'focused_index', route:'focused' }, { id:'live_federation', route:'live' }, { id:'simple_combination', route:'simple' },
  { id:'repaired_fast', route:'combined', operatingProfile:'fast' }, { id:'repaired_balanced', route:'combined', operatingProfile:'balanced' },
  { id:'repaired_thorough', route:'combined', operatingProfile:'thorough' },
];
const vertical = { commerce_marketplaces:'commerce', property_local_markets:'property', company_competitive:'companies', research_evidence:'research', developer_agent_retrieval:'developer_documentation' };
function quantile(values, fraction) { const sorted=[...values].sort((a,b)=>a-b); return sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*fraction)-1)] ?? 0; }
function mean(values) { return values.length === 0 ? 0 : values.reduce((a,b)=>a+b,0)/values.length; }
function variance(values) { const average=mean(values); return mean(values.map((value)=>(value-average)**2)); }
function round(value, digits=4) { return Number(value.toFixed(digits)); }
function canonical(result) { return result.canonicalUrl ?? result.url ?? ''; }
function normalizedUrl(value) { return value.toLocaleLowerCase('en-US').replace(/^https?:\/\/(?:www\.)?/u,'').replace(/\/$/u,''); }
function resultMatches(result, label) {
  const url=normalizedUrl(canonical(result)); const text=`${result.title ?? ''}\n${result.evidenceText ?? ''}`.toLocaleLowerCase('en-US');
  return label.urls.some((prefix)=>url.startsWith(normalizedUrl(prefix))) && label.terms.every((term)=>text.includes(term.toLocaleLowerCase('en-US')));
}
function exactCitationValid(payload) {
  const results=payload.results ?? [], citations=payload.citations ?? [];
  if (results.length === 0) return citations.length === 0;
  if (citations.length !== results.length) return false;
  return citations.every((citation)=>{ const result=results.find((item)=>item.resultId===citation.resultId); return result && citation.canonicalUrl===canonical(result) && citation.extractionId===result.extraction?.extractionId && Number.isInteger(citation.startOffset) && Number.isInteger(citation.endOffset) && result.evidenceText.slice(citation.startOffset,citation.endOffset)===citation.quote; });
}
function dcg(grades) { return grades.reduce((sum,grade,index)=>sum+(2**grade-1)/Math.log2(index+2),0); }
function measure(task, payload) {
  const label=labels.get(task.id); const results=Array.isArray(payload.results)?payload.results:[]; const relevant=results.map((result,index)=>({result,index})).filter(({result})=>resultMatches(result,label));
  const multiRequired=task.features.includes('distinct_sellers')||task.features.includes('distinct_locations'); const expected=label.urls.length===0?0:multiRequired?label.urls.length:1;
  const matchedPrefixes=new Set(relevant.flatMap(({result})=>label.urls.filter((prefix)=>normalizedUrl(canonical(result)).startsWith(normalizedUrl(prefix)))));
  const recall=expected===0?(results.length===0?1:0):Math.min(1,matchedPrefixes.size/expected); const precision=results.length===0?(expected===0?1:0):relevant.length/results.length;
  const grades=results.slice(0,10).map((result)=>resultMatches(result,label)?label.grade:0); const ideal=Array.from({length:Math.max(1,expected)},()=>label.grade).slice(0,10);
  const first=relevant[0]?.index; const totalChars=results.reduce((sum,result)=>sum+(result.evidenceText?.length??0),0); const relevantChars=relevant.reduce((sum,{result})=>sum+(result.evidenceText?.length??0),0);
  const official=task.features.includes('official_preference');
  return { recall, precision, exactCitationValidity: exactCitationValid(payload)?1:0,
    structuredFieldAccuracy: results.length===0?(expected===0?1:0):results.filter((result)=>typeof result.title==='string'&&canonical(result).startsWith('http')&&typeof result.providerId==='string'&&typeof result.routeId==='string').length/results.length,
    successfulExtraction: results.length===0?(expected===0?1:0):results.filter((result)=>typeof result.evidenceText==='string'&&result.evidenceText.length>0).length/results.length,
    freshnessCorrectness: results.length===0?(expected===0?1:0):results.filter((result)=>Number.isFinite(Date.parse(result.retrievedAt))&&Date.parse(result.retrievedAt)<=Date.now()).length/results.length,
    duplicateHandling: new Set(results.map(canonical)).size===results.length?1:0, localeCorrectness: payload.language===undefined?1:(payload.language===task.locale.language&&payload.region===task.locale.region?1:0),
    honestNoResult: expected===0?(results.length===0?1:0):1, ndcg10: ideal.length===0?1:(dcg(grades)/dcg(ideal)), mrr10:first===undefined?0:1/(first+1), success1:first===0?1:0, success3:first!==undefined&&first<3?1:0, success10:first!==undefined&&first<10?1:0,
    officialSourcePreference: official?(first===0?1:0):null, evidenceDensity:totalChars===0?(expected===0?1:0):relevantChars/totalChars, irrelevantContentRatio:totalChars===0?0:1-relevantChars/totalChars,
    resultCount:results.length, relevantResultCount:relevant.length };
}
async function request(task, scenario) {
  const started=performance.now(); let status=0,payload={lifecycle:'unavailable',results:[]};
  try { const response=await fetch(`${baseUrl}/v1/search`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:task.query,route:scenario.route,maximumResults:10,language:task.locale.language,region:task.locale.region,verticalProfile:vertical[task.family],...(scenario.operatingProfile?{operatingProfile:scenario.operatingProfile}:{})})}); status=response.status; payload=await response.json(); } catch (error) { payload={lifecycle:'unavailable',code:error instanceof Error?error.message:'transport_failed',results:[]}; }
  return {status,durationMs:performance.now()-started,payload};
}
const rows=[];
for (const scenario of cases) for (const task of corpus.tasks) for (let repetition=1;repetition<=3;repetition+=1) { const execution=await request(task,scenario); rows.push({scenario:scenario.id,repetition,task,execution,metrics:measure(task,execution.payload)}); }
function aggregate(inputRows) {
  const primary=inputRows.filter((row)=>row.repetition===1); const average=(key)=>mean(primary.map((row)=>row.metrics[key])); const latencies=inputRows.map((row)=>row.execution.durationMs);
  const result={tasks:primary.length,recall:round(average('recall')),precision:round(average('precision')),exactCitationValidity:round(average('exactCitationValidity')),structuredFieldAccuracy:round(average('structuredFieldAccuracy')),successfulExtractionRate:round(average('successfulExtraction')),freshnessCorrectness:round(average('freshnessCorrectness')),duplicateHandling:round(average('duplicateHandling')),localeCorrectness:round(average('localeCorrectness')),honestNoResultOrDegraded:round(average('honestNoResult')),nDCG10:round(average('ndcg10')),MRR10:round(average('mrr10')),success1:round(average('success1')),success3:round(average('success3')),success10:round(average('success10')),officialSourcePreferenceAccuracy:round(mean(primary.map((row)=>row.metrics.officialSourcePreference).filter((value)=>value!==null))),evidenceDensity:round(average('evidenceDensity')),irrelevantContentRatio:round(average('irrelevantContentRatio')),latencyMs:{runs:3,p50:round(quantile(latencies,.5),2),median:round(quantile(latencies,.5),2),p95:round(quantile(latencies,.95),2),variance:round(variance(latencies),2)}};
  result.qualityScore=round(result.recall*.30+result.precision*.25+result.exactCitationValidity*.20+result.structuredFieldAccuracy*.10+result.freshnessCorrectness*.05+result.duplicateHandling*.05+result.localeCorrectness*.05);
  return result;
}
const scorecards=Object.fromEntries(cases.map((scenario)=>[scenario.id,aggregate(rows.filter((row)=>row.scenario===scenario.id))]));
const familyScorecards=Object.fromEntries(Object.keys(vertical).map((family)=>[family,aggregate(rows.filter((row)=>row.scenario==='repaired_balanced'&&row.task.family===family))]));
const historical=JSON.parse(await readFile(new URL('docs/evidence/n4.26/quality-scorecard.v1.json',root)));
const gates={overallRecall:scorecards.repaired_balanced.recall>=.92,overallPrecision:scorecards.repaired_balanced.precision>=.88,citationValidity:scorecards.repaired_balanced.exactCitationValidity>=.98,structuredFieldAccuracy:scorecards.repaired_balanced.structuredFieldAccuracy>=.90,successfulExtraction:scorecards.repaired_balanced.successfulExtractionRate>=.95,balancedP95:scorecards.repaired_balanced.latencyMs.p95<=2000,rankingMetrics:scorecards.repaired_balanced.nDCG10>=.88&&scorecards.repaired_balanced.MRR10>=.85&&scorecards.repaired_balanced.success3>=.90,familyFloors:Object.values(familyScorecards).every((family)=>family.recall>=.85&&family.precision>=.85&&family.exactCitationValidity>=.95&&family.nDCG10>=.82),liveRoute:scorecards.live_federation.recall>=.35&&scorecards.live_federation.precision>=.60&&scorecards.live_federation.latencyMs.p95<=4000,thoroughImprovesRecall:scorecards.repaired_thorough.recall>scorecards.repaired_balanced.recall,baselineVictory:scorecards.repaired_balanced.qualityScore>=Math.max(scorecards.focused_index.qualityScore,scorecards.live_federation.qualityScore,scorecards.simple_combination.qualityScore)&&scorecards.repaired_balanced.qualityScore-scorecards.simple_combination.qualityScore>=.03};
const report={schemaVersion:'clervo.n4.27.holdout-scorecard.v1',generatedAt:new Date().toISOString(),corpus:{tasks:50,sha256:sha256(await readFile(new URL('benchmarks/n4.27/holdout-corpus.v1.json',root)))},labels:{sha256:sha256(await readFile(new URL('benchmarks/n4.27/holdout-labels.v1.json',root)))},implementationFreeze:sha256(await readFile(new URL('benchmarks/n4.27/implementation-freeze.v1.json',root))),scorecards,familyScorecards,historicalN426Combined:historical.baselines.combined,unavailableBaselines:{exa:'unavailable_no_owner_controlled_credential_or_no_charge_entitlement',tavily:'official_information_reviewed_direct_test_unavailable',firecrawlHosted:'official_information_reviewed_direct_test_unavailable',firecrawlOpenSource:'unavailable_not_safely_reproduced_in_ticket_window',selectedOpenSourceAlternative:'typesense_30.2_reviewed_but_not_safely_reproduced_before_final_freeze'},gates,mandatoryGatePass:Object.values(gates).every(Boolean),claimAuthorized:false};
await mkdir(outputRoot,{recursive:true}); const rawBytes=gzipSync(`${JSON.stringify({schemaVersion:'clervo.n4.27.holdout-raw.v1',generatedAt:report.generatedAt,rows})}\n`,{level:9});
report.rawArtifact={path:'docs/evidence/n4.27/holdout-final/raw-results.v1.json.gz',sha256:sha256(rawBytes),executions:rows.length};
await writeFile(new URL('raw-results.v1.json.gz',outputRoot),rawBytes); await writeFile(new URL('scorecard.v1.json',outputRoot),`${JSON.stringify(report,null,2)}\n`);
await writeFile(markerUrl,`${JSON.stringify({schemaVersion:'clervo.n4.27.holdout-final-run.v1',executedAt:report.generatedAt,runCount:1,scorecardSha256:sha256(`${JSON.stringify(report,null,2)}\n`),mandatoryGatePass:report.mandatoryGatePass},null,2)}\n`);
process.stdout.write(`${JSON.stringify({executions:rows.length,mandatoryGatePass:report.mandatoryGatePass,gates,balanced:scorecards.repaired_balanced})}\n`);
