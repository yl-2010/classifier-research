/**
 * Aggregate frozen-eval metrics with live user classification events.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIXED_SUBJECTS, isFixedSubject, normalizeSubjectLabel } from "./subjects.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_FROZEN_PATH = path.join(REPO_ROOT, "web", "public", "research-metrics.json");

const ARM_META = {
  zero_shot: { label: "Zero-shot BERT", voteKey: "baseBert" },
  fine_tuned: { label: "Fine-tuned BERT", voteKey: "fineTunedBert" },
  gpt_oss: { label: "GPT-OSS 20B", voteKey: "gptOss" },
};

const ARM_KEYS = Object.keys(ARM_META);

function emptyCounts() {
  const byClass = {};
  for (const s of FIXED_SUBJECTS) {
    byClass[s] = { tp: 0, fp: 0, fn: 0, support: 0 };
  }
  return { n: 0, correct: 0, byClass };
}

/** Recover approximate TP/FP/FN from frozen per-class precision/recall/support. */
export function countsFromPerClass(perClass) {
  const counts = emptyCounts();
  if (!perClass || typeof perClass !== "object") return counts;

  for (const s of FIXED_SUBJECTS) {
    const row = perClass[s];
    if (!row) continue;
    const support = Math.max(0, Math.round(Number(row.support) || 0));
    const recall = Number(row.recall);
    const precision = Number(row.precision);
    const tp = Number.isFinite(recall) ? Math.max(0, Math.round(recall * support)) : 0;
    let fp = 0;
    if (Number.isFinite(precision) && precision > 0) {
      const predPos = Math.round(tp / precision);
      fp = Math.max(0, predPos - tp);
    } else if (tp === 0 && Number.isFinite(precision) && precision === 0) {
      // Unknown FP when precision is 0; leave at 0 (conservative for pooling).
      fp = 0;
    }
    const fn = Math.max(0, support - tp);
    counts.byClass[s] = { tp, fp, fn, support };
    counts.n += support;
    counts.correct += tp;
  }
  return counts;
}

export function addPrediction(counts, gold, pred) {
  const g = normalizeSubjectLabel(gold);
  const p = normalizeSubjectLabel(pred);
  if (!isFixedSubject(g) || !p) return false;
  // Predictions outside the fixed taxonomy count as wrong (FN only).
  counts.n += 1;
  counts.byClass[g].support += 1;
  if (p === g) {
    counts.correct += 1;
    counts.byClass[g].tp += 1;
    return true;
  }
  counts.byClass[g].fn += 1;
  if (isFixedSubject(p)) {
    counts.byClass[p].fp += 1;
  }
  return true;
}

export function mergeCounts(a, b) {
  const out = emptyCounts();
  out.n = a.n + b.n;
  out.correct = a.correct + b.correct;
  for (const s of FIXED_SUBJECTS) {
    out.byClass[s] = {
      tp: a.byClass[s].tp + b.byClass[s].tp,
      fp: a.byClass[s].fp + b.byClass[s].fp,
      fn: a.byClass[s].fn + b.byClass[s].fn,
      support: a.byClass[s].support + b.byClass[s].support,
    };
  }
  return out;
}

function safeDiv(num, den) {
  return den > 0 ? num / den : 0;
}

export function summarizeCounts(counts, name, extra = {}) {
  const per_class = {};
  const f1s = [];
  for (const s of FIXED_SUBJECTS) {
    const { tp, fp, fn, support } = counts.byClass[s];
    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    per_class[s] = { precision, recall, f1, support };
    f1s.push(f1);
  }
  const accuracy = safeDiv(counts.correct, counts.n);
  const macro_f1 = f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : 0;
  return {
    name,
    n: counts.n,
    accuracy,
    micro_f1: accuracy,
    macro_f1,
    per_class,
    ...extra,
  };
}

/** Gold label for a user research event: explicit correction wins, else finalSubject. */
export function goldFromEvent(event) {
  if (!event || typeof event !== "object") return null;
  const gold = normalizeSubjectLabel(event.userGoldSubject || event.finalSubject);
  return isFixedSubject(gold) ? gold : null;
}

export function predFromEvent(event, armKey) {
  const meta = ARM_META[armKey];
  if (!meta || !event) return null;
  const vote = event.votes?.[meta.voteKey];
  const subject = normalizeSubjectLabel(vote?.subject);
  return subject || null;
}

export function accumulateUserEvents(events) {
  const byArm = Object.fromEntries(ARM_KEYS.map((k) => [k, emptyCounts()]));
  let used = 0;
  for (const event of events || []) {
    const gold = goldFromEvent(event);
    if (!gold) continue;
    let any = false;
    for (const armKey of ARM_KEYS) {
      const pred = predFromEvent(event, armKey);
      if (!pred) continue;
      if (addPrediction(byArm[armKey], gold, pred)) any = true;
    }
    if (any) used += 1;
  }
  return { byArm, used };
}

export async function loadFrozenMetrics(filePath = DEFAULT_FROZEN_PATH) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

/**
 * Build metrics payload.
 * @param {object} opts
 * @param {boolean} opts.includeUser
 * @param {object[]} [opts.userEvents]
 * @param {object} [opts.frozen]
 * @param {string} [opts.frozenPath]
 */
export async function buildResearchMetrics({
  includeUser = false,
  userEvents = [],
  frozen = null,
  frozenPath = DEFAULT_FROZEN_PATH,
} = {}) {
  const base = frozen || (await loadFrozenMetrics(frozenPath));
  const subjects = Array.isArray(base.subjects) ? base.subjects : [...FIXED_SUBJECTS];

  if (!includeUser) {
    return {
      ...base,
      subjects,
      include_user_tests: false,
      user_test_n: 0,
      source: "frozen_eval",
    };
  }

  const { byArm: userByArm, used: userTestN } = accumulateUserEvents(userEvents);
  const arms = {};

  for (const armKey of ARM_KEYS) {
    const frozenArm = base.arms?.[armKey] || {};
    const frozenCounts = countsFromPerClass(frozenArm.per_class);
    // Prefer arm.n when present (more reliable than reconstructed support sum).
    if (typeof frozenArm.n === "number" && frozenArm.n > frozenCounts.n) {
      // Scale is already in per_class supports for balanced sets; keep reconstructed.
    }
    const merged = mergeCounts(frozenCounts, userByArm[armKey]);
    const meta = ARM_META[armKey];
    arms[armKey] = summarizeCounts(merged, armKey, {
      label: frozenArm.label || meta.label,
      protocol: frozenArm.protocol,
      model: frozenArm.model,
      model_dir: frozenArm.model_dir,
      frozen_n: frozenArm.n ?? frozenCounts.n,
      user_n: userByArm[armKey].n,
    });
  }

  const frozenN = typeof base.test_n === "number" ? base.test_n : 0;

  return {
    subjects,
    test_n: frozenN + userTestN,
    arms,
    updated_at: new Date().toISOString(),
    frozen_updated_at: base.updated_at || null,
    include_user_tests: true,
    user_test_n: userTestN,
    frozen_test_n: frozenN,
    source: "frozen_eval+user_tests",
  };
}

export { DEFAULT_FROZEN_PATH, ARM_KEYS, ARM_META };
