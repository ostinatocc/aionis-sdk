#!/usr/bin/env node

import {
  traceDerivedSkillCandidatesFromMeasure,
  traceDerivedSkillReviewItemsFromMeasure,
} from "@aionis/sdk";

const measure = {
  contract_version: "aionis_measure_result_v1",
  effect_report: {
    contract_version: "aionis_effect_report_v1",
    training_candidates: [
      {
        candidate_type: "trace_derived_skill",
        source_ids: ["effect_kernel:continuity", "run:checkout-run-001"],
        label: "positive",
        export_ready: true,
        reason: "Positive continuity evidence produced a controlled trace-derived skill candidate.",
        trace_derived_skill: {
          contract_version: "aionis_trace_derived_skill_candidate_v1",
          skill_name: "Continue verified execution state across sessions",
          source_trace_ids: ["effect_kernel:continuity", "run:checkout-run-001"],
          source_signal_ids: ["useful_continuity_improved"],
          applies_when: [
            "task_signature:checkout-migration",
            "future_session_needs_verified_continuation",
          ],
          does_not_apply_when: [
            "A newer memory contests, suppresses, or supersedes the source trace.",
            "The current task is outside the recorded scope or task family.",
          ],
          procedure_steps: [
            "Recover the current Aionis guide before continuing the task.",
            "Continue from the verified active path instead of rediscovering prior state.",
            "Keep failed commands and abandoned branches as counter-evidence, not as routes.",
            "Run the recorded acceptance checks before treating the continuation as reusable.",
          ],
          target_files: ["src/checkout.ts"],
          acceptance_checks: ["effect_kernel_passed", "comparison_evidence_sufficient"],
          failure_counterexamples: ["legacy checkout route failed integration verification"],
          evidence_refs: ["useful_continuity_improved", "feedback:checkout-run-001"],
          authority_state: "candidate",
          promotion_status: "promotion_ready",
          export_policy: {
            agent_prompt_included: false,
            runtime_mutation: false,
            required_gate: "admission_and_promotion_gate",
          },
        },
      },
    ],
  },
};

const candidates = traceDerivedSkillCandidatesFromMeasure(measure);
const reviewItems = traceDerivedSkillReviewItemsFromMeasure(measure);

for (const item of reviewItems) {
  if (
    item.safety.authority_state !== "candidate"
    || item.safety.agent_prompt_included !== false
    || item.safety.runtime_mutation !== false
    || item.safety.required_gate !== "admission_and_promotion_gate"
  ) {
    throw new Error(`Unsafe trace-derived skill review item: ${item.skill_name}`);
  }
}

console.log(JSON.stringify({
  product_path: "trace -> feedback attribution -> measure -> candidate -> review -> promotion gate",
  candidate_count: candidates.length,
  review_item_count: reviewItems.length,
  review_items: reviewItems.map((item) => ({
    skill_name: item.skill_name,
    review_action: item.review_action,
    promotion_status: item.promotion_status,
    applies_when: item.applies_when,
    procedure_steps: item.procedure_steps,
    acceptance_checks: item.acceptance_checks,
    safety: item.safety,
  })),
}, null, 2));
