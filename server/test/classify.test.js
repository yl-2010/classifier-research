import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeBertVote } from "../bert.js";
import { extractJsonObject, resolveSubject } from "../classify.js";
import { OTHER_SUBJECT } from "../subjects.js";

describe("normalizeBertVote", () => {
  it("returns null for empty input", () => {
    assert.equal(normalizeBertVote(null), null);
    assert.equal(normalizeBertVote(undefined), null);
  });

  it("maps BERT service fields", () => {
    const vote = normalizeBertVote({
      subject: "Physics",
      confidence: 0.82,
      probs: { Physics: 0.82, Mathematics: 0.1 },
      latencyMs: 40,
      protocol: "zero_shot_cls_cosine",
      model: "bert-base-uncased",
    });
    assert.equal(vote.subject, "Physics");
    assert.equal(vote.confidence, 0.82);
    assert.equal(vote.protocol, "zero_shot_cls_cosine");
    assert.deepEqual(vote.probs.Physics, 0.82);
  });
});

describe("extractJsonObject", () => {
  it("parses bare JSON", () => {
    const obj = extractJsonObject('{"subject":"Biology","confidence":0.9}');
    assert.equal(obj.subject, "Biology");
  });

  it("extracts JSON from surrounding text", () => {
    const obj = extractJsonObject('Sure.\n{"subject":"History","confidence":0.7}\n');
    assert.equal(obj.subject, "History");
  });
});

describe("resolveSubject", () => {
  it("keeps fixed subjects", () => {
    const r = resolveSubject({ subject: "Chemistry" }, []);
    assert.equal(r.subject, "Chemistry");
    assert.equal(r.createdCustom, null);
  });

  it("creates custom from Other suggestion", () => {
    const r = resolveSubject(
      { subject: OTHER_SUBJECT, customSuggestion: "APUSH" },
      []
    );
    assert.equal(r.subject, "APUSH");
    assert.equal(r.createdCustom, "APUSH");
  });

  it("matches existing custom case-insensitively", () => {
    const r = resolveSubject(
      { subject: OTHER_SUBJECT, customSuggestion: "apush" },
      ["APUSH"]
    );
    assert.equal(r.subject, "APUSH");
    assert.equal(r.createdCustom, null);
  });
});
