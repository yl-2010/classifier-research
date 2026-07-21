import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageMime } from "../ocr.js";

test("normalizeImageMime accepts common note photo types", () => {
  assert.equal(normalizeImageMime("image/png"), "image/png");
  assert.equal(normalizeImageMime("image/jpeg"), "image/jpeg");
  assert.equal(normalizeImageMime("image/jpg"), "image/jpeg");
  assert.equal(normalizeImageMime("image/webp; charset=binary"), "image/webp");
  assert.equal(normalizeImageMime("application/pdf"), null);
  assert.equal(normalizeImageMime(""), null);
});
