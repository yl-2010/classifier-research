import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSubjectColorResponse,
  CUSTOM_SUBJECT_COLOR_FALLBACK,
} from "../subjectColor.js";

describe("subjectColor", () => {
  it("builds hex from rgb channels", () => {
    assert.equal(
      parseSubjectColorResponse({ r: 196, g: 92, b: 38, hex: "#bad" }),
      "#c45c26"
    );
  });

  it("falls back to valid hex when rgb missing", () => {
    assert.equal(
      parseSubjectColorResponse({ hex: "#AbCdEf" }),
      "#abcdef"
    );
  });

  it("returns null for invalid payloads", () => {
    assert.equal(parseSubjectColorResponse(null), null);
    assert.equal(parseSubjectColorResponse({ hex: "red" }), null);
    assert.equal(parseSubjectColorResponse({ r: 999, g: -1, b: 10 }), "#ff000a");
  });

  it("exports gray fallback", () => {
    assert.equal(CUSTOM_SUBJECT_COLOR_FALLBACK, "#64748b");
  });
});
