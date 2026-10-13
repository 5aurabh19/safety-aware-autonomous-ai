import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { z } from 'zod';
import { appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors());
app.use(express.json({ limit: '24kb' }));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const auditPath = resolve(root, '..', '.safety-aware-audit', 'audit.jsonl');

const Result = z.object({
  classification: z.enum(['independent_automation','human_approval','never_delegate']),
  riskLevel: z.enum(['low','moderate','high','critical']),
  rationale: z.string().min(20).max(900),
  keyAssumptions: z.array(z.string().min(2).max(180)).min(1).max(5),
  humanSafeguards: z.array(z.string().min(2).max(180)).min(1).max(6),
  factors: z.object({ potentialHarm:z.string().min(2).max(180), reversibility:z.string().min(2).max(180), uncertainty:z.string().min(2).max(180), regulatoryImpact:z.string().min(2).max(180) }).strict()
}).strict();
const schema = {
  type:'object', additionalProperties:false,
  properties:{
    classification:{type:'string',enum:['independent_automation','human_approval','never_delegate']},
    riskLevel:{type:'string',enum:['low','moderate','high','critical']},
    rationale:{type:'string'},
    keyAssumptions:{type:'array',items:{type:'string'}},
    humanSafeguards:{type:'array',items:{type:'string'}},
    factors:{type:'object',additionalProperties:false,properties:{potentialHarm:{type:'string'},reversibility:{type:'string'},uncertainty:{type:'string'},regulatoryImpact:{type:'string'}},required:['potentialHarm','reversibility','uncertainty','regulatoryImpact']}
  }, required:['classification','riskLevel','rationale','keyAssumptions','humanSafeguards','factors']
};
const Request = z.object({ decision:z.string().trim().min(12).max(1600), context:z.string().trim().max(700).optional().default('') }).strict();

function fallback(decision:string, context:string) {
  const catastrophic = /fatal|life.?threat|bypass|disable.*(alarm|interlock|guard)|silenc(e|ing).*alarm|alarm.*silenc|over.?pressure|toxic release|chlorine leak|explosion|fire|emergency stop|safety system|evacuat/i.test(`${decision} ${context}`);
  return {
    classification: catastrophic ? 'never_delegate' as const : 'human_approval' as const,
    riskLevel: catastrophic ? 'critical' as const : 'high' as const,
    rationale: catastrophic
      ? 'The description contains a high-consequence safety signal. Do not delegate this action to AI; keep it under qualified human and engineered safety-system control.'
      : 'The model could not provide a validated assessment. Treat this operational decision as high risk and require qualified human review before any action.',
    keyAssumptions:['The supplied description may omit site-specific hazards, interlocks, permits, or applicable requirements.'],
    humanSafeguards:['Pause the proposed action and consult the site safety procedure and a qualified operations or safety lead.','Do not connect this advisory result to equipment or control systems.'],
    factors:{potentialHarm:'Unknown from the available description; assume significant until assessed.',reversibility:'Unknown; confirm safe rollback and recovery before proceeding.',uncertainty:'High because site context and validated operating boundaries are missing.',regulatoryImpact:'Unknown; verify applicable permits, standards, and approved procedures.'}
  };
}

async function audit(entry:Record<string,unknown>) {
  await mkdir(dirname(auditPath),{recursive:true});
  await appendFile(auditPath, JSON.stringify({ id:randomUUID(), timestamp:new Date().toISOString(), ...entry })+'\n', {encoding:'utf8',mode:0o600});
}

app.get('/api/health',(_req,res)=>res.json({ ok:true, provider:process.env.AI_PROVIDER||'openai', model:process.env.AI_MODEL||'gpt-4.1-mini' }));
app.post('/api/classify', async (req,res) => {
  const parsed = Request.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error:'Please provide a decision (12–1,600 characters) and optional context.' });
  const {decision,context}=parsed.data;
  const provider=process.env.AI_PROVIDER||'openai';
  const model=process.env.AI_MODEL||'gpt-4.1-mini';
  try {
    const apiKey=process.env.AI_API_KEY||process.env.OPENAI_API_KEY;
    if (!apiKey || (provider !== 'openai' && !process.env.AI_BASE_URL)) throw new Error('Model provider is not configured');
    const client=new OpenAI({apiKey, ...(process.env.AI_BASE_URL?{baseURL:process.env.AI_BASE_URL}:{})});
    const response=await client.responses.create({
      model,
      instructions:'You are an industrial safety decision-support assistant. Classify the proposed decision conservatively using potential harm, reversibility, uncertainty, and regulatory impact. Never endorse AI control of emergency response, safety interlocks, life-critical actions, bypasses, or decisions that could cause catastrophic harm; classify such cases never_delegate. When details are missing or consequences are material, require human approval. Independent automation is only for bounded, low-consequence, reversible, validated routine decisions. State assumptions and practical safeguards. This is advisory only. Never suggest direct equipment actions by this system.',
      input:`Decision: ${decision}\nSite context: ${context||'Not provided'}`,
      text:{format:{type:'json_schema',name:'industrial_safety_classification',strict:true,schema}}
    });
    const raw=response.output_text;
    if (!raw) throw new Error('Empty model response');
    const result=Result.parse(JSON.parse(raw));
    await audit({provider,model,outcome:'model',submission:decision.slice(0,1600),result});
    return res.json({ ...result, source:'model', model });
  } catch (error) {
    const result=fallback(decision,context);
    await audit({provider,model,outcome:'fallback',reason:error instanceof Error?error.message:'invalid model response',submission:decision.slice(0,1600),result}).catch(()=>{});
    return res.json({ ...result, source:'fallback', model });
  }
});

export { app, root };
