# @aionis/sdk

TypeScript SDK facade for Aionis Runtime.

Docs: [https://docs.aionis.work/plugins/sdk](https://docs.aionis.work/plugins/sdk)

Source: [https://github.com/ostinatocc/aionis-sdk](https://github.com/ostinatocc/aionis-sdk)

```bash
npm install @aionis/sdk
```

SDK `0.3.17` is the client for the Aionis Runtime `v0.3.8` Local Runtime Public
Beta candidate. It adds exact persisted guide-feedback attribution, canonical
host-task envelopes, strict host-use feedback receipts, and protected
guide/feedback operation identity while retaining typed durable writes and
Runtime-owned evidence assessment. This is a beta contract for a single
self-hosted Runtime process, not a GA managed or multi-instance HA contract.
`feedbackFromGuide()` requires Runtime-provided `feedback_attribution_v1`;
refresh cached guides created by older Runtime contracts before feedback.

## Canonical AgentContext

The recommended Agent-facing contract is `AgentContext.agent_prompt`:

- `guideAgentContext()` for ordinary TypeScript hosts.
- `execution.guideAgentContextForRole()` for role-aware execution memory.
- `guide()` and `execution.guideForRole()` are lower-level guide contracts for
  hosts that need to inspect Runtime fields before compiling their own surface.

By default, `agent_prompt` is the SDK-rendered execution contract
(`AIONIS_EXECUTION_AGENT_CONTEXT v1`). Structured receipts, command posture,
route contracts, and resolved evidence stay available on the returned object for
host logic and audit.

Runtime `agent_context.prompt_text` has its own renderings:

| Runtime mode | Header | Use |
|---|---|---|
| standard | `AIONIS_AGENT_CONTEXT v1` | Raw HTTP hosts that pass Runtime guide text directly. |
| compact | `AIONIS_CTX v2` | Explicit low-token Runtime prompt mode. |

Do not append Runtime `agent_context.prompt_text` to SDK `agent_prompt`.
`AIONIS_CTX v2` is used as the SDK final prompt only when a host explicitly
sets `prompt_format: "runtime_compact"`.

MCP, AIFS, and Claude Code integrations use the same SDK AgentContext renderer.
Do not create another final-context adapter unless the product surface matrix is
updated first.

```ts
import {
  commandPostureFromGuide,
  createAionisClient,
  feedbackAttributionFromGuide,
  feedbackFromGuide,
  mem0SearchResultsToAionisCandidates,
  memoryAdmissionDatasetJsonlFromGuide,
  memoryAdmissionRecordFromGuide,
  measureInputFromGuideLoop,
  mustNotMemoryIdsFromGuide,
  planAssetObserveEvents,
  shouldContinueMemoryIdsFromGuide,
  snapshotInputFromGuideLoop,
  traceDerivedSkillCandidatesFromMeasure,
  traceDerivedSkillReviewItemsFromMeasure,
  type AionisObserveResult,
} from "@aionis/sdk";

const aionis = createAionisClient({
  baseUrl: process.env.AIONIS_URL ?? "http://127.0.0.1:3001",
  apiKey: process.env.AIONIS_API_KEY,
  tenant_id: "default",
  scope: "my-agent",
});

const context = await aionis.guideAgentContext({
  query_text: "Continue the task.",
  consumer_agent_id: "agent-1",
  limit: 8,
  include_packets: true,
}, undefined, {
  task: "Continue the task.",
  budget_profile: "balanced",
});

const agentPrompt = context.agent_prompt;
const commandPosture = commandPostureFromGuide(context.guide);
const mustNotMemoryIds = mustNotMemoryIdsFromGuide(context.guide);
const shouldContinueMemoryIds = shouldContinueMemoryIdsFromGuide(context.guide);
const admissionRecord = memoryAdmissionRecordFromGuide(context.guide);
const admissionDatasetJsonl = memoryAdmissionDatasetJsonlFromGuide(context.guide, {
  run_id: "run-001",
  task_signature: "first-integration",
});

const feedbackSource = feedbackAttributionFromGuide(context.guide);
if (feedbackSource.status !== "available") {
  throw new Error("Request a new guide before submitting learning feedback.");
}
const agentRun = await runYourInstrumentedAgent(agentPrompt);
const feedback = agentRun.used_memory_ids.length === 0
  ? null
  : await aionis.feedback(feedbackFromGuide({
      guide: context.guide,
      reason: "Agent used the attributed memory successfully.",
      run_id: "run-001",
      outcome: "positive",
      used_memory_ids: agentRun.used_memory_ids,
    }));

const measure = await aionis.measure(measureInputFromGuideLoop({
  task: {
    task_id: "task-001",
    run_id: "run-001",
    task_signature: "first-integration",
  },
  after_guide: context.guide,
  feedback_result: feedback,
}));

console.log(measure.evidence_assessment);
if (measure.evidence_assessment.eligible_for_skill_export) {
  const traceSkillCandidates = traceDerivedSkillCandidatesFromMeasure(measure);
  for (const candidate of traceSkillCandidates) {
    console.log(candidate.trace_derived_skill.skill_name);
  }

  const traceSkillReviewItems = traceDerivedSkillReviewItemsFromMeasure(measure);
  for (const item of traceSkillReviewItems) {
    console.log(item.skill_name, item.review_action, item.safety.required_gate);
  }
}

await aionis.snapshot(snapshotInputFromGuideLoop({
  run_id: "run-001",
  task_signature: "first-integration",
  guide: context.guide,
  measure_result: measure,
}));
```

`feedback_attribution_v1.items` is the persisted eligibility/source projection,
not proof that the Agent used every listed memory. Populate `used_memory_ids`
only from host execution instrumentation. `feedbackFromGuide()` validates those
observations against the exact persisted item and served surface; it never falls
back to `agent_context`, and a context-only continuity handoff is rejected
locally. A missing or unavailable attribution requires a new compatible guide.

Pass `context.agent_prompt` to your Agent. Keep packets, traces, receipts,
admission records, raw slots, and operator snapshots in host logs.
Use `commandPostureFromGuide()` when the host wants structured execution
instructions: `must_not` blocks failed or stale branches, `should_continue`
biases the Agent toward active state or accepted procedure, `inspect_first`
keeps candidate history out of direct action, and `rehydrate_first` asks the
host to recover raw payload before exact use.

For token-sensitive Agent calls, request compact Runtime guide rendering and a
compact SDK execution contract:

```ts
const compactContext = await aionis.guideAgentContext({
  query_text: "Continue the task from the current accepted state.",
  consumer_agent_id: "agent-1",
  context_mode: "compact_agent",
}, undefined, {
  budget_profile: "compact",
});

const compactPrompt = compactContext.agent_prompt;
```

`context_mode: "compact_agent"` asks Runtime for compact guide context; the SDK
final Agent prompt still defaults to `AIONIS_EXECUTION_AGENT_CONTEXT v1`. Set
`prompt_format: "runtime_compact"` only when the host intentionally wants the
Runtime compact guide text as the final prompt. `guideAgentContext()` also
resolves recoverable `inspect_before_use` and `rehydrate` evidence into
`resolved_evidence`; resolved evidence is included in the default SDK prompt and
can be omitted with `include_resolved_evidence_in_prompt: false`.

## Formal Host-Use Evidence

Instrumented hosts and deterministic scorers can submit evidence-bound feedback
with the Runtime-owned `host_task_envelope_v1` and `host_use_receipt_v1`
contracts. Build the task envelope before guide, give guide its own protected
`operation_id`, then build the use receipt after execution with a separate
feedback operation ID:

```ts
import {
  buildHostTaskEnvelopeV1,
  buildHostUseReceiptV1,
  feedbackAttributionFromGuide,
  feedbackFromGuide,
  hostTaskEnvelopeDigest,
} from "@aionis/sdk";

const taskEnvelope = buildHostTaskEnvelopeV1({
  contract_version: "host_task_envelope_v1",
  host_task_id: "task-001",
  collector_id: "my-instrumented-host",
  collector_version: "1.0.0",
  task_family: "coding",
  task_signature: "checkout-migration",
  repository_signature: "repo:checkout-service",
  source_task_sha256: sourceTaskSha256,
  source_event_sha256: sourceEventSha256,
  created_at: new Date().toISOString(),
});

const guide = await aionis.guide({
  query_text: "Continue the checkout migration.",
  operation_id: "guide:task-001:attempt-1",
  host_task_envelope_v1: taskEnvelope,
});
const attribution = feedbackAttributionFromGuide(guide);
if (attribution.status !== "available") {
  throw new Error("Request a new guide before submitting learning feedback.");
}

const feedbackOperationId = "feedback:task-001:attempt-1";
const receipt = buildHostUseReceiptV1({
  contract_version: "host_use_receipt_v1",
  receipt_id: "receipt:task-001:attempt-1",
  guide_trace_id: guide.guide_trace_id,
  episode_id: attribution.episode_id,
  operation_id: feedbackOperationId,
  run_id: "run-001",
  host_task_id: taskEnvelope.host_task_id,
  host_task_envelope_sha256: hostTaskEnvelopeDigest(taskEnvelope),
  collector_id: taskEnvelope.collector_id,
  collector_version: taskEnvelope.collector_version,
  host_trace_sha256: hostTraceSha256,
  observed_at: new Date().toISOString(),
  items: verifiedUseItems,
});

await aionis.feedback(feedbackFromGuide({
  guide,
  operation_id: feedbackOperationId,
  host_use_receipt_v1: receipt,
  reason: "The deterministic acceptance checks passed.",
  run_id: "run-001",
  outcome: "positive",
  used_memory_ids: receipt.items.map((item) => item.memory_id),
}));
```

`buildHostUseReceiptV1()` canonicalizes receipt item order and binds its digest.
`feedbackFromGuide()` then requires exact agreement across guide identity,
canonical episode ID, run, operation, memory set, served surface, outcome, and
verifier result. Every receipt item must also match an exact persisted item and
served surface in `feedback_attribution_v1`. Receipts carry hashes and
references, not raw evidence. Use the ordinary feedback path for hosts that
cannot independently produce this evidence; do not synthesize a formal receipt
from an uninstrumented run.

## Durable Writes And Evidence Assessment

Supply one `operation_id` for each logical execution write and reuse it only to
retry the exact same request:

```ts
const observed = await aionis.execution.observeStep<AionisObserveResult>({
  operation_id: "observe:run-001:worker-1:step-1",
  agent_id: "worker-1",
  run_id: "run-001",
  task_signature: "checkout-migration",
  title: "Implement checkout adapter",
  summary: "The adapter is implemented and ready for review.",
  outcome: "succeeded",
});

console.log(observed.operation_id, observed.post_commit_projections);
```

The Runtime stores the receipt with the semantic write. An exact retry returns
that receipt; using the same ID for different content returns HTTP `409`.
`embedding: "scheduled"` or `ann_sync: "scheduled"` means a durable projection
job exists, not that the external side effect is already complete.

For `/v1/measure`, client fields `sufficient_evidence` and `evidence_ids` are
compatibility claims only. They are recorded under
`evidence_assessment.client_claims_ignored` and cannot make a manual measure
export-ready. Gate learning and skill export on the Runtime-owned
`evidence_assessment.eligible_for_skill_export` field.

## Trace-Derived Skill Candidates

When `/v1/measure` has Runtime-verified positive continuity or workflow-reuse
evidence and `eligible_for_skill_export` is true, Aionis can expose
`trace_derived_skill` entries inside `effect_report.training_candidates`.

These are controlled training assets, not prompt instructions. The product
path is:

```text
agent trace -> feedback attribution -> measure -> skill candidate -> review -> promotion gate
```

The candidate is intentionally safe by default:

- `agent_prompt_included` is always `false`
- `runtime_mutation` is always `false`
- `authority_state` is always `candidate`
- later use must pass the normal admission and promotion gates

Use `traceDerivedSkillCandidatesFromMeasure()` when you want the raw Runtime
candidate contract. Use `traceDerivedSkillReviewItemsFromMeasure()` when you
want a compact review queue item with `skill_name`, applicability conditions,
procedure steps, acceptance checks, evidence refs, and the safety gate. The
review item is read-only; it does not promote or inject the candidate into an
Agent prompt.

Run the minimal review-item verification:

```bash
npm run build
npm run verify:trace-to-skill
```

The verification prints the product path and a safe review item:

```text
trace -> feedback attribution -> measure -> candidate -> review -> promotion gate
```

The output proves the candidate remains `authority_state: "candidate"`,
`agent_prompt_included: false`, and `runtime_mutation: false`.

## Plan As Memory Asset

Use `planAssetObserveEvents()` when a strong planner, reviewer, or human lead
creates an execution plan that should survive across agents, sessions, or model
tiers. The helper records the accepted plan as current execution memory and
records rejected routes as failed branch evidence.

```ts
const planEvents = planAssetObserveEvents({
  run_id: "run-001",
  task_signature: "checkout-migration",
  planner_agent_id: "claude-planner",
  title: "Checkout migration plan",
  summary: "Move checkout orchestration to the typed adapter path.",
  active_targets: ["packages/api/src/checkoutAdapter.ts"],
  decisions: [
    "Keep legacy fullBundleEnvironment.ts read-only as reference evidence.",
    "Implement the new adapter path before extending checkout orchestration.",
  ],
  acceptance_checks: [
    "npm run -s test -- checkout",
    "No writes to legacy fullBundleEnvironment.ts",
  ],
  rejected_branches: [
    {
      title: "Extend legacy bundle environment",
      summary: "Verifier rejected the legacy route.",
      target_files: ["packages/api/src/fullBundleEnvironment.ts"],
      reason: "It passed narrow smoke checks but failed checkout integration.",
    },
  ],
});

for (const event of planEvents) {
  await aionis.execution.observeStep(event);
}

const planContext = await aionis.execution.guideAgentContextForRole({
  agent_id: "worker-1",
  role: "worker",
  run_id: "run-001",
  task_signature: "checkout-migration",
  query_text: "Implement the accepted plan without reusing rejected routes.",
});

// Your host runs the worker Agent with planContext.agent_prompt.
```

The failed branch details are emitted as separate failed evidence instead of
being folded into the direct-use plan summary. That keeps the worker prompt
short while preserving counter-evidence for the Runtime gate.

Runnable proof:

```bash
npm run -s runtime:e2e:plan-as-memory-asset
```

## Execution Memory Helpers

Use `aionis.execution` when the host wants branch-aware execution memory without
hand-writing low-level payloads.

```ts
await aionis.execution.observeStep({
  agent_id: "worker-1",
  run_id: "run-001",
  task_signature: "checkout-migration",
  title: "Implement checkout adapter",
  summary: "Worker implemented the adapter and needs review.",
  outcome: "succeeded",
  target_files: ["src/checkout.ts"],
});

const context = await aionis.execution.guideAgentContextForRole({
  agent_id: "reviewer-1",
  team_id: "checkout-team",
  role: "reviewer",
  run_id: "run-001",
  task_signature: "checkout-migration",
  query_text: "Continue from the current verified execution path.",
}, undefined, {
  repo_state: {
    existing_files: ["src/checkout.ts"],
  },
  budget_profile: "balanced",
});

// Your host runs the Agent with context.agent_prompt.
const agentRun = await runYourInstrumentedAgent(context.agent_prompt);

const feedback = await aionis.execution.feedbackFromOutcome({
  agent_id: "reviewer-1",
  run_id: "run-001",
  task_signature: "checkout-migration",
  title: "Reviewer continued branch",
  summary: "Reviewer used the current execution memory.",
  outcome: "succeeded",
  guide: context.guide,
  used_memory_ids: agentRun.used_memory_ids,
});
```

`guideAgentContext()` and `execution.guideAgentContextForRole()` are the
recommended product paths for coding and multi-agent hosts. They ask Runtime for
a governed guide, compile the SDK execution AgentContext as `agent_prompt`,
resolve recoverable evidence pointers, and expose structured adapter state:

- active route targets and pending artifacts
- reference-only and blocked direction targets
- `use_now`, `inspect_before_use`, `do_not_use`, and `rehydrate` memory IDs
- a compact Memory Use Receipt for audit and feedback attribution
- a Memory Admission Record for per-memory admission dataset rows
- warnings when a host-observed active target is missing

This helper does not mutate Runtime state and does not expose raw packets to the
Agent. `compiled_context` is a program/audit surface for hosts that need route
metadata, not a second default Agent prompt.

For a host loop, the most common posture helpers are:

```ts
const mustNot = mustNotMemoryIdsFromGuide(guide);
const shouldContinue = shouldContinueMemoryIdsFromGuide(guide);
const posture = commandPostureFromGuide(guide);
const route = routeContractFromGuide(guide);
const evidence = evidenceSourcesFromGuide(guide);
const blocked = blockedRoutesFromGuide(guide);
```

These helpers read only `agent_context`. They do not expose `memory_packet`,
`guide_packet`, traces, or operator-only evidence to the Agent.
`routeContractFromGuide` exposes the structured execution contract:
`active_targets` are the continuation route, `pending_artifacts` describe
missing-active-target handling, `evidence_sources` are reference-only evidence,
and `blocked_routes` are counter-evidence only.

`memoryAdmissionRecordFromGuide(guide)` is the host/operator surface for the
read-only admission ledger. It records candidate memory IDs, admission actions,
prompt exposure, and feedback attribution without changing Runtime authority or
adding content to the Agent prompt.

`memoryAdmissionDatasetJsonlFromGuide(guide)` exports that ledger as JSONL rows
for host logs or a data lake. It keeps raw prompt text, raw memory payloads, and
embeddings out of the export while preserving enough admission/outcome fields to
audit decisions or train a future admission policy offline.

## Govern External Memory

Use `governMemory()` when your host already has candidates from Mem0, Zep,
Pinecone, pgvector, markdown, logs, or another memory backend, but still wants
Aionis to decide which memory may direct the Agent.

Product guide:
[https://docs.aionis.work/products/memory-firewall](https://docs.aionis.work/products/memory-firewall)

```ts
const result = await aionis.governMemory({
  query_text: "Continue the checkout migration from the current accepted state.",
  mode: "firewall",
  include_records: true,
  candidates: [
    {
      external_memory_id: "mem0:current-route",
      source_backend: "mem0",
      text: "Current accepted target is packages/api/src/checkout.ts.",
      authority: {
        source_trust: "trusted",
        scope: "project",
        evidence_requirement: "none",
      },
      lifecycle_hint: "current",
    },
    {
      external_memory_id: "zep:failed-route",
      source_backend: "zep",
      text: "The legacy route failed verifier checks.",
      authority: {
        source_trust: "trusted",
        scope: "project",
        evidence_requirement: "none",
      },
      lifecycle_hint: "failed",
    },
  ],
});

const firewallPrompt = result.agent_context.prompt_text;
const firewall = result.memory_firewall;
```

`mode: "firewall"` blocks failed, stale, contested, suppressed, archived, or
policy-blocked external memory from direct action. Unknown or untrusted memory
stays `inspect_before_use`; raw evidence pointers stay `rehydrate`.
This is the Memory Firewall prompt surface for external memory candidates; it is
not the canonical task AgentContext. For normal task execution, use
`guideAgentContext().agent_prompt`.

### Mem0 Drop-In Firewall

If your host already calls Mem0, keep Mem0 as the retrieval backend and put
Aionis at the admission boundary:

```ts
const mem0Results = await mem0.search("Continue checkout migration", {
  user_id: "checkout-agent",
  top_k: 10,
});

const governed = await aionis.governMem0SearchResults({
  query_text: "Continue checkout migration from the current accepted state.",
  run_id: "run-001",
  mem0_results: mem0Results,
});

const firewallPromptForAgent = governed.agent_context.prompt_text;
const receiptForLogs = governed.memory_use_receipt;
const firewallForOps = governed.memory_firewall;
```

`governMem0SearchResults()` defaults to:

- `mode: "firewall"`
- `context_mode: "compact_agent"`
- `include_records: true`
- `source_backend: "mem0"`

It accepts plain Mem0 search JSON and does not import or depend on the Mem0
package. Metadata is preserved when present:

```ts
const candidates = mem0SearchResultsToAionisCandidates(mem0Results, {
  default_authority: {
    source_trust: "known",
    scope: "project",
    evidence_requirement: "inspect_before_use",
  },
});
```

Unlabeled Mem0 results are safe by default: they become inspect-first candidates
instead of direct Agent instructions. To allow direct use, attach trusted
authority plus `lifecycle_hint: "current"` or `lifecycle_hint: "procedure"` in
Mem0 metadata.

## Replay Agent Decisions

Use `flightRecorder()` after a run to inspect what memory the Agent was allowed
to see at decision time.

Product guide:
[https://docs.aionis.work/products/flight-recorder](https://docs.aionis.work/products/flight-recorder)

```ts
const replay = await aionis.flightRecorder({
  run_id: "run-001",
  guide_trace_id: guide.guide_trace_id,
  product_trace: {
    before_guide: previousGuide,
    after_guide: guide,
  },
  feedback_result: {
    run_id: "run-001",
    outcome: "positive",
    // Exact IDs recorded as dereferenced by the instrumented Agent/host trace.
    used_memory_ids: instrumentedAgentRun.used_memory_ids,
  },
});

console.log(replay.agent_flight_recorder.agent_view.use_now_memory_ids);
```

The report excludes `agent_context.prompt_text` and raw memory payloads. Keep it
in host/operator logs for incident replay, support debugging, and memory-quality
review.
