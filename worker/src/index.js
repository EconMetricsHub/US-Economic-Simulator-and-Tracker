const REGIONS = ['us','eu','uk','jp','cn','em'];
const OPS = ['set','increase','decrease'];

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN || '*').split(',').map(x => x.trim()).filter(Boolean);
}

function originAllowed(origin, env) {
  const allowed = allowedOrigins(env);
  return allowed.includes('*') || (!!origin && allowed.includes(origin));
}

function cors(origin, env) {
  const allowed = allowedOrigins(env);
  const use = allowed.includes('*') ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': use || '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin'
  };
}

function clamp(v, a, b, d) {
  v = Number(v);
  return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d;
}

function safeString(v, max = 1200) {
  return String(v ?? '').slice(0, max);
}

function registryFromContext(context) {
  const sliders = Array.isArray(context?.sliderRegistry) ? context.sliderRegistry : [];
  const shocks = Array.isArray(context?.shockTargets) ? context.shockTargets : [];
  const sliderMap = new Map();
  const shockMap = new Map();
  for (const x of sliders) {
    if (!x?.id) continue;
    sliderMap.set(String(x.id), {
      id: String(x.id),
      label: safeString(x.label || x.id, 100),
      unit: safeString(x.unit || 'model_units', 60),
      minimum: Number(x.minimum),
      maximum: Number(x.maximum),
      step: Number(x.step) || 1,
      currentValue: Number(x.currentValue),
      allowedOperations: Array.isArray(x.allowedOperations) ? x.allowedOperations.filter(v => OPS.includes(v)) : OPS,
      economicMeaning: safeString(x.economicMeaning || x.description || '', 700),
      downstreamEffects: Array.isArray(x.downstreamEffects) ? x.downstreamEffects.slice(0, 10).map(String) : []
    });
  }
  for (const x of shocks) {
    if (!x?.id) continue;
    shockMap.set(String(x.id), {
      id: String(x.id),
      label: safeString(x.label || x.id, 100),
      unit: safeString(x.unit || 'model_units', 60),
      minimum: Number(x.minimum),
      maximum: Number(x.maximum),
      economicMeaning: safeString(x.economicMeaning || x.description || '', 700)
    });
  }
  if (!sliderMap.size) throw new Error('No slider registry supplied by the application');
  if (!shockMap.size) throw new Error('No shock-target registry supplied by the application');
  return {sliderMap, shockMap};
}

function scenarioSchema(sliderIds, shockIds) {
  return {
    type: 'object',
    properties: {
      registryVersion: {type: 'string'},
      scenarioName: {type: 'string'},
      region: {type: 'string', enum: REGIONS},
      confidence: {type: 'number'},
      rationale: {type: 'string'},
      assumptions: {type: 'array', items: {type: 'string'}},
      sliderChanges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {type: 'string', enum: sliderIds},
            operation: {type: 'string', enum: OPS},
            value: {type: 'number'},
            reason: {type: 'string'}
          },
          required: ['id','operation','value','reason'],
          additionalProperties: false
        }
      },
      settings: {
        type: 'object',
        properties: {
          taylorRule: {
            type: 'object',
            properties: {
              apply: {type: 'boolean'},
              enabled: {type: 'boolean'},
              reason: {type: 'string'}
            },
            required: ['apply','enabled','reason'],
            additionalProperties: false
          }
        },
        required: ['taylorRule'],
        additionalProperties: false
      },
      shock: {
        type: 'object',
        properties: {
          enabled: {type: 'boolean'},
          label: {type: 'string'},
          category: {type: 'string'},
          shockType: {type: 'string', enum: ['temporary','persistent','structural']},
          durationMonths: {type: 'integer'},
          peakMonth: {type: 'integer'},
          decayRate: {type: 'number'},
          confidence: {type: 'number'},
          magnitude: {type: 'number'},
          rationale: {type: 'string'},
          assumptions: {type: 'array', items: {type: 'string'}},
          channels: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target: {type: 'string', enum: shockIds},
                effect: {type: 'number'},
                lagMonths: {type: 'integer'},
                peakMonth: {type: 'integer'}
              },
              required: ['target','effect','lagMonths','peakMonth'],
              additionalProperties: false
            }
          }
        },
        required: ['enabled','label','category','shockType','durationMonths','peakMonth','decayRate','confidence','magnitude','rationale','assumptions','channels'],
        additionalProperties: false
      }
    },
    required: ['registryVersion','scenarioName','region','confidence','rationale','assumptions','sliderChanges','settings','shock'],
    additionalProperties: false
  };
}

function validateScenario(raw, context, registry) {
  const {sliderMap, shockMap} = registry;
  const region = REGIONS.includes(context?.country) ? context.country : 'us';
  const changes = [];
  for (const c of (Array.isArray(raw?.sliderChanges) ? raw.sliderChanges : []).slice(0, 12)) {
    const def = sliderMap.get(String(c?.id || ''));
    if (!def) continue;
    const op = def.allowedOperations.includes(c.operation) ? c.operation : 'set';
    let value = Number(c.value);
    if (!Number.isFinite(value)) continue;
    if (op === 'set') value = clamp(value, def.minimum, def.maximum, def.currentValue);
    else value = Math.abs(value);
    const base = Number.isFinite(def.currentValue) ? def.currentValue : 0;
    const rawFinal = op === 'set' ? value : op === 'increase' ? base + value : base - value;
    const finalValue = clamp(rawFinal, def.minimum, def.maximum, base);
    changes.push({
      id: def.id,
      operation: op,
      value,
      finalValue,
      reason: safeString(c.reason, 500)
    });
  }

  const shockRaw = raw?.shock || {};
  const channels = [];
  for (const c of (Array.isArray(shockRaw.channels) ? shockRaw.channels : []).slice(0, 5)) {
    const def = shockMap.get(String(c?.target || ''));
    if (!def) continue;
    const effect = clamp(c.effect, def.minimum, def.maximum, 0);
    if (Math.abs(effect) < 1e-12) continue;
    channels.push({
      target: def.id,
      effect,
      lagMonths: Math.round(clamp(c.lagMonths, 0, 60, 0)),
      peakMonth: Math.round(clamp(c.peakMonth, 1, 120, 1))
    });
  }
  const enabled = !!shockRaw.enabled && channels.length > 0;
  const type = ['temporary','persistent','structural'].includes(shockRaw.shockType) ? shockRaw.shockType : 'persistent';
  const shock = {
    enabled,
    label: safeString(shockRaw.label || raw?.scenarioName || 'AI scenario shock', 120),
    category: safeString(shockRaw.category || 'Custom', 40),
    shockType: type,
    durationMonths: Math.round(clamp(shockRaw.durationMonths, 1, 240, type === 'temporary' ? 9 : type === 'structural' ? 120 : 36)),
    peakMonth: Math.round(clamp(shockRaw.peakMonth, 1, 120, type === 'temporary' ? 2 : type === 'structural' ? 12 : 4)),
    decayRate: clamp(shockRaw.decayRate, 0, 1, type === 'structural' ? 0 : 0.08),
    confidence: clamp(shockRaw.confidence, 0.05, 1, 0.65),
    magnitude: clamp(shockRaw.magnitude, 0.05, 3, 1),
    rationale: safeString(shockRaw.rationale, 1200),
    assumptions: (Array.isArray(shockRaw.assumptions) ? shockRaw.assumptions : []).slice(0, 6).map(x => safeString(x, 300)),
    channels
  };

  return {
    registryVersion: safeString(context?.registryVersion || raw?.registryVersion || 'unknown', 40),
    scenarioName: safeString(raw?.scenarioName || 'AI counterfactual', 120),
    region,
    confidence: clamp(raw?.confidence, 0.05, 1, 0.6),
    rationale: safeString(raw?.rationale, 1500),
    assumptions: (Array.isArray(raw?.assumptions) ? raw.assumptions : []).slice(0, 8).map(x => safeString(x, 350)),
    sliderChanges: changes,
    settings: {
      taylorRule: {
        apply: !!raw?.settings?.taylorRule?.apply,
        enabled: !!raw?.settings?.taylorRule?.enabled,
        reason: safeString(raw?.settings?.taylorRule?.reason, 500)
      }
    },
    shock
  };
}

async function callProvider(env, body) {
  if (!env.LLM_API_KEY) throw new Error('LLM_API_KEY is not configured');
  const base = (env.LLM_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
  const r = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${env.LLM_API_KEY}`},
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Provider ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const data = await r.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty provider response');
  return String(raw);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const h = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, {headers: h});
    if (request.method === 'POST' && !originAllowed(origin, env)) {
      return new Response(JSON.stringify({error:'Origin not allowed'}), {status:403, headers:{...h,'Content-Type':'application/json'}});
    }
    if (request.method === 'GET') {
      return new Response(JSON.stringify({ok:true, service:'MACROSCOPE AI bridge', model:env.LLM_MODEL || 'openai/gpt-oss-20b'}), {headers:{...h,'Content-Type':'application/json'}});
    }
    if (request.method !== 'POST') return new Response(JSON.stringify({error:'POST only'}), {status:405, headers:{...h,'Content-Type':'application/json'}});

    try {
      const {prompt, context, mode} = await request.json();
      const text = String(prompt || '').trim();
      if (!text || text.length > 12000) return new Response(JSON.stringify({error:'Prompt required (max 12000 chars)'}), {status:400, headers:{...h,'Content-Type':'application/json'}});

      if (mode === 'analyst') {
        const system = `You are the explanation layer for MACROSCOPE, a transparent macroeconomic counterfactual simulator. Use ONLY the simulator context supplied by the user. Distinguish model outputs, user assumptions, and observed/release data. Do not invent current prices, news, events, or model coefficients. Explain causal chains, countervailing forces, uncertainty, and the largest drivers. If baseline and counterfactual outputs are provided, compare them directly. Portfolio results are scenario sensitivities, not investment advice or price forecasts. Be concise but substantive.`;
        const body = {
          model: env.LLM_MODEL || 'openai/gpt-oss-20b',
          messages: [
            {role:'system', content:system},
            {role:'user', content:`SIMULATOR CONTEXT:\n${JSON.stringify(context || {})}\n\nQUESTION:\n${text}`}
          ],
          temperature: 0.25,
          max_completion_tokens: 1400
        };
        const answer = await callProvider(env, body);
        return new Response(JSON.stringify({answer}), {headers:{...h,'Content-Type':'application/json'}});
      }

      const registry = registryFromContext(context);
      const sliderIds = [...registry.sliderMap.keys()];
      const shockIds = [...registry.shockMap.keys()];
      const schema = scenarioSchema(sliderIds, shockIds);
      const system = `You are the scenario-construction layer for MACROSCOPE. Translate the user's economic counterfactual into a cautious structured command. You do NOT execute code, manipulate the interface, or invent new controls. Use only slider IDs and shock-target IDs supplied in the simulator context.\n\nUse sliderChanges for persistent state or policy changes that correspond to existing controls. For temporary, lagged, or explicitly time-bounded macro effects, use the structured shock object. A scenario may use both. If the user asks to enable or disable the Taylor Rule, set settings.taylorRule.apply=true and choose enabled accordingly. Otherwise set apply=false and preserve the current Taylor Rule state in enabled. Do not change the region; return the current context country.\n\nOperations: set means the requested absolute level; increase/decrease means a positive delta from the current value. Respect units, ranges, and economic meaning from the registry. Do not force every plausible channel into the scenario. Prefer the smallest defensible set of controls, generally 1-8 slider changes and no more than 5 shock channels. Do not claim causal certainty. Preserve ambiguity as assumptions and lower confidence when the prompt is underspecified.\n\nFor financial or economic news, treat the text as a scenario input rather than verified truth unless the context marks it as observed data.`;
      const body = {
        model: env.LLM_MODEL || 'openai/gpt-oss-20b',
        messages: [
          {role:'system', content:system},
          {role:'user', content:`SIMULATOR CONTEXT:\n${JSON.stringify(context || {})}\n\nCOUNTERFACTUAL OR NEWS INPUT:\n${text}`}
        ],
        temperature: 0.2,
        max_completion_tokens: 1800,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'macroscope_scenario_command',
            strict: true,
            schema
          }
        }
      };
      const raw = await callProvider(env, body);
      const command = validateScenario(JSON.parse(raw), context, registry);
      return new Response(JSON.stringify({command}), {headers:{...h,'Content-Type':'application/json'}});
    } catch (e) {
      return new Response(JSON.stringify({error:String(e?.message || e)}), {status:500, headers:{...h,'Content-Type':'application/json'}});
    }
  }
};
