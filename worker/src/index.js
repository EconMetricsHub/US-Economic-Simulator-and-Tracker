const ALLOWED_TARGETS = new Set([
  'gdpA','cpiA','spA','ffr','oil','natgas','tariff','shippingCost','unemp','lfp',
  'innovRate','aiAdoption','privateCapex','housingSupply','deficit','govSpend',
  'igSpreads','hySpreads','creditImpulse','termPremium','foreignDemand','dxy',
  'policyCert','ruleOfLaw','conflictIndex','commercialREStress','gridReliability','nearshoring'
]);

function cors(origin, env) {
  const allowed=(env.ALLOWED_ORIGIN||'*').split(',').map(x=>x.trim());
  const use=allowed.includes('*')? '*': (allowed.includes(origin)?origin:allowed[0]);
  return {'Access-Control-Allow-Origin':use,'Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
}
function clamp(v,a,b,d){v=Number(v);return Number.isFinite(v)?Math.max(a,Math.min(b,v)):d;}
function validate(s){
  const t=['temporary','persistent','structural'].includes(s?.shockType)?s.shockType:'persistent';
  const channels=(Array.isArray(s?.channels)?s.channels:[]).filter(c=>ALLOWED_TARGETS.has(c?.target)&&Number.isFinite(Number(c?.effect))).slice(0,5).map(c=>({target:c.target,effect:Number(c.effect),lagMonths:clamp(c.lagMonths,0,60,0),peakMonth:clamp(c.peakMonth,1,120,1)}));
  if(!channels.length) throw new Error('Model returned no valid channels');
  return {label:String(s.label||s.name||'AI-generated shock').slice(0,120),category:String(s.category||'Custom').slice(0,40),shockType:t,durationMonths:clamp(s.durationMonths,1,240,t==='temporary'?8:t==='structural'?120:36),peakMonth:clamp(s.peakMonth,1,120,t==='temporary'?2:t==='structural'?12:6),decayRate:clamp(s.decayRate,0,1,t==='structural'?0.01:0.08),confidence:clamp(s.confidence,.05,1,.6),magnitude:clamp(s.magnitude,.05,3,1),rationale:String(s.rationale||'').slice(0,1500),assumptions:Array.isArray(s.assumptions)?s.assumptions.slice(0,6).map(String):[],channels};
}

export default {async fetch(request,env){
  const origin=request.headers.get('Origin')||''; const h=cors(origin,env);
  if(request.method==='OPTIONS') return new Response(null,{headers:h});
  if(request.method!=='POST') return Response.json({error:'POST only'},{status:405,headers:h});
  try {
    const {prompt,context,mode}=await request.json();
    if(!prompt||String(prompt).length>6000) return Response.json({error:'Prompt required (max 6000 chars)'},{status:400,headers:h});
    const analystMode=mode==='analyst';
    const system=analystMode
      ? `You are the explanation layer for MACROSCOPE, a transparent macroeconomic scenario simulator. Answer ONLY from the simulator context supplied by the user. Clearly distinguish model outputs, user assumptions, and observed/release data. Do not invent current market facts, prices, or news. Explain causal chains, identify the strongest drivers, discuss countervailing forces and model uncertainty, and flag when a question cannot be answered from the supplied state. Be concise but substantive (normally 3-6 short paragraphs). Portfolio results are scenario sensitivities, not investment advice or price forecasts.`
      : `You are the scenario-construction layer for a transparent U.S. macroeconomic simulator. Convert the user's scenario into ONE cautious structured shock proposal. Do not claim causal certainty. Use only target IDs supplied in context.availableTargets. Prefer 3-5 channels. Effects are full shock effects: gdpA and cpiA are percentage points; spA is percent; ffr is percentage points; oil/natgas are dollar changes; spreads are basis points; unemployment/lfp are percentage points; index-like inputs are changes in model units. Distinguish immediate market channels from lagged macro channels. Return ONLY valid JSON with keys: label, category, shockType (temporary|persistent|structural), durationMonths, peakMonth, decayRate, confidence (0.05-1), magnitude (0.05-3), rationale, assumptions (array), channels (array of {target,effect,lagMonths,peakMonth}).`;
    const body={model:env.LLM_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:system},{role:'user',content:`CONTEXT:
${JSON.stringify(context||{})}

${analystMode?'QUESTION':'SCENARIO'}:
${String(prompt)}`}],temperature:analystMode?.25:.2};
    if(!analystMode) body.response_format={type:'json_object'};
    const base=(env.LLM_API_BASE||'https://api.openai.com/v1').replace(/\/$/,'');
    const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${env.LLM_API_KEY}`},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(`Provider ${r.status}: ${(await r.text()).slice(0,300)}`);
    const data=await r.json(); const raw=data?.choices?.[0]?.message?.content; if(!raw) throw new Error('Empty provider response');
    if(analystMode) return new Response(JSON.stringify({answer:String(raw)}),{headers:{...h,'Content-Type':'application/json'}});
    const shock=validate(JSON.parse(raw));
    return new Response(JSON.stringify({shock}),{headers:{...h,'Content-Type':'application/json'}});
  } catch(e) {return new Response(JSON.stringify({error:String(e?.message||e)}),{status:500,headers:{...h,'Content-Type':'application/json'}});}
}};
