import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slugifyLabel, uniquifyTitle } from "../titles.js";

describe("slugifyLabel", () => {
  it("slugifies subject-style labels", () => {
    assert.equal(slugifyLabel("Computer Science"), "computer-science");
    assert.equal(slugifyLabel("  Hello, World!  "), "hello-world");
  });

  it("falls back for empty input", () => {
    assert.equal(slugifyLabel(""), "note");
    assert.equal(slugifyLabel("!!!"), "note");
  });
});

describe("uniquifyTitle", () => {
  it("keeps the first title as-is", () => {
    assert.equal(uniquifyTitle("Binary Trees", []), "Binary Trees");
    assert.equal(
      uniquifyTitle("Binary Trees", ["Other Note"]),
      "Binary Trees"
    );
  });

  it("appends a counter for duplicate titles", () => {
    assert.equal(
      uniquifyTitle("Binary Trees", ["Binary Trees"]),
      "Binary Trees 2"
    );
    assert.equal(
      uniquifyTitle("Binary Trees", ["Binary Trees", "Binary Trees 2"]),
      "Binary Trees 3"
    );
  });

  it("is case-insensitive on titles", () => {
    assert.equal(
      uniquifyTitle("binary trees", ["Binary Trees"]),
      "binary trees 2"
    );
  });

  it("avoids slug collisions from near-duplicate titles", () => {
    assert.equal(
      uniquifyTitle("Hello World", ["Hello-World"]),
      "Hello World 2"
    );
  });

  it("falls back for empty base", () => {
    assert.equal(uniquifyTitle("   ", []), "Untitled note");
    assert.equal(
      uniquifyTitle("", ["Untitled note"]),
      "Untitled note 2"
    );
  });
});
