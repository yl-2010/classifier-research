import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageMime, probeOpenAiOcr } from "../ocr.js";

test("normalizeImageMime accepts common note photo types", () => {
  assert.equal(normalizeImageMime("image/png"), "image/png");
  assert.equal(normalizeImageMime("image/jpeg"), "image/jpeg");
  assert.equal(normalizeImageMime("image/jpg"), "image/jpeg");
  assert.equal(normalizeImageMime("image/webp; charset=binary"), "image/webp");
  assert.equal(normalizeImageMime("application/pdf"), null);
  assert.equal(normalizeImageMime(""), null);
});

test("probeOpenAiOcr reports unavailable when key is missing", async () => {
  const prev = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await probeOpenAiOcr();
    assert.equal(result.configured, false);
    assert.equal(result.ok, false);
    assert.match(result.error || "", /OPENAI_API_KEY/);
  } finally {
    if (prev === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prev;
  }
});
