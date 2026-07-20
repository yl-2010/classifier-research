import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addPrediction,
  accumulateUserEvents,
  buildResearchMetrics,
  countsFromPerClass,
  mergeCounts,
  summarizeCounts,
} from "../research-metrics.js";

const frozenFixture = {
  subjects: [
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Computer Science",
    "History",
    "Literature",
    "Economics",
  ],
  test_n: 2,
  updated_at: "2026-01-01T00:00:00Z",
  arms: {
    zero_shot: {
      name: "zero_shot",
      n: 2,
      accuracy: 0.5,
      micro_f1: 0.5,
      macro_f1: 0.5,
      label: "Zero-shot BERT",
      per_class: {
        Mathematics: { precision: 1, recall: 1, f1: 1, support: 1 },
        Physics: { precision: 0, recall: 0, f1: 0, support: 1 },
        Chemistry: { precision: 0, recall: 0, f1: 0, support: 0 },
        Biology: { precision: 0, recall: 0, f1: 0, support: 0 },
        "Computer Science": { precision: 0, recall: 0, f1: 0, support: 0 },
        History: { precision: 0, recall: 0, f1: 0, support: 0 },
        Literature: { precision: 0, recall: 0, f1: 0, support: 0 },
        Economics: { precision: 0, recall: 0, f1: 0, support: 0 },
      },
    },
    fine_tuned: {
      name: "fine_tuned",
      n: 2,
      accuracy: 1,
      micro_f1: 1,
      macro_f1: 1,
      label: "Fine-tuned BERT",
      per_class: {
        Mathematics: { precision: 1, recall: 1, f1: 1, support: 1 },
        Physics: { precision: 1, recall: 1, f1: 1, support: 1 },
        Chemistry: { precision: 0, recall: 0, f1: 0, support: 0 },
        Biology: { precision: 0, recall: 0, f1: 0, support: 0 },
        "Computer Science": { precision: 0, recall: 0, f1: 0, support: 0 },
        History: { precision: 0, recall: 0, f1: 0, support: 0 },
        Literature: { precision: 0, recall: 0, f1: 0, support: 0 },
        Economics: { precision: 0, recall: 0, f1: 0, support: 0 },
      },
    },
    gpt_oss: {
      name: "gpt_oss",
      n: 2,
      accuracy: 1,
      micro_f1: 1,
      macro_f1: 1,
      label: "GPT-OSS 20B",
      per_class: {
        Mathematics: { precision: 1, recall: 1, f1: 1, support: 1 },
        Physics: { precision: 1, recall: 1, f1: 1, support: 1 },
        Chemistry: { precision: 0, recall: 0, f1: 0, support: 0 },
        Biology: { precision: 0, recall: 0, f1: 0, support: 0 },
        "Computer Science": { precision: 0, recall: 0, f1: 0, support: 0 },
        History: { precision: 0, recall: 0, f1: 0, support: 0 },
        Literature: { precision: 0, recall: 0, f1: 0, support: 0 },
        Economics: { precision: 0, recall: 0, f1: 0, support: 0 },
      },
    },
  },
};

describe("research-metrics", () => {
  it("reconstructs counts and summarizes accuracy", () => {
    const counts = countsFromPerClass(frozenFixture.arms.zero_shot.per_class);
    assert.equal(counts.n, 2);
    assert.equal(counts.correct, 1);
    const summary = summarizeCounts(counts, "zero_shot");
    assert.equal(summary.accuracy, 0.5);
    assert.equal(summary.per_class.Mathematics.support, 1);
  });

  it("accumulates user events against gold labels", () => {
    const { byArm, used } = accumulateUserEvents([
      {
        finalSubject: "Biology",
        votes: {
          baseBert: { subject: "Biology" },
          fineTunedBert: { subject: "Chemistry" },
          gptOss: { subject: "Biology" },
        },
      },
      {
        finalSubject: "APUSH",
        votes: {
          baseBert: { subject: "History" },
          fineTunedBert: { subject: "History" },
          gptOss: { subject: "History" },
        },
      },
    ]);
    assert.equal(used, 1);
    assert.equal(byArm.zero_shot.correct, 1);
    assert.equal(byArm.fine_tuned.correct, 0);
    assert.equal(byArm.gpt_oss.correct, 1);
  });

  it("prefers userGoldSubject over finalSubject", () => {
    const { byArm } = accumulateUserEvents([
      {
        finalSubject: "Biology",
        userGoldSubject: "Physics",
        votes: {
          baseBert: { subject: "Physics" },
          fineTunedBert: { subject: "Biology" },
          gptOss: { subject: "Physics" },
        },
      },
    ]);
    assert.equal(byArm.zero_shot.correct, 1);
    assert.equal(byArm.fine_tuned.correct, 0);
  });

  it("pools frozen + user when includeUser is true", async () => {
    const userEvents = [
      {
        finalSubject: "Physics",
        votes: {
          baseBert: { subject: "Physics" },
          fineTunedBert: { subject: "Physics" },
          gptOss: { subject: "Physics" },
        },
      },
    ];
    const off = await buildResearchMetrics({
      includeUser: false,
      frozen: frozenFixture,
      userEvents,
    });
    assert.equal(off.include_user_tests, false);
    assert.equal(off.include_frozen_tests, true);
    assert.equal(off.user_test_n, 1);
    assert.equal(off.arms.zero_shot.accuracy, 0.5);

    const on = await buildResearchMetrics({
      includeUser: true,
      frozen: frozenFixture,
      userEvents,
    });
    assert.equal(on.include_user_tests, true);
    assert.equal(on.include_frozen_tests, true);
    assert.equal(on.user_test_n, 1);
    assert.equal(on.test_n, 3);
    assert.ok(Math.abs(on.arms.zero_shot.accuracy - 2 / 3) < 1e-9);
  });

  it("supports user-only when includeFrozen is false", async () => {
    const userEvents = [
      {
        finalSubject: "Physics",
        votes: {
          baseBert: { subject: "Physics" },
          fineTunedBert: { subject: "Physics" },
          gptOss: { subject: "Physics" },
        },
      },
    ];
    const userOnly = await buildResearchMetrics({
      includeFrozen: false,
      includeUser: true,
      frozen: frozenFixture,
      userEvents,
    });
    assert.equal(userOnly.include_user_tests, true);
    assert.equal(userOnly.include_frozen_tests, false);
    assert.equal(userOnly.user_test_n, 1);
    assert.equal(userOnly.frozen_test_n, 0);
    assert.equal(userOnly.test_n, 1);
    assert.equal(userOnly.arms.zero_shot.accuracy, 1);
    assert.equal(userOnly.source, "user_tests");
  });

  it("forces frozen on when both includes are false", async () => {
    const forced = await buildResearchMetrics({
      includeFrozen: false,
      includeUser: false,
      frozen: frozenFixture,
      userEvents: [],
    });
    assert.equal(forced.include_frozen_tests, true);
    assert.equal(forced.include_user_tests, false);
    assert.equal(forced.source, "frozen_eval");
  });

  it("mergeCounts adds supports", () => {
    const a = countsFromPerClass({
      Mathematics: { precision: 1, recall: 1, f1: 1, support: 2 },
    });
    const b = countsFromPerClass({});
    addPrediction(b, "Mathematics", "Mathematics");
    const m = mergeCounts(a, b);
    assert.equal(m.byClass.Mathematics.support, 3);
    assert.equal(m.correct, 3);
  });
});
