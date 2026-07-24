import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chunkPaperText,
  formatPaperForChat,
  retrievePaperForChat,
  shouldRetrievePaper,
} from "../paperContext.js";

describe("chunkPaperText", () => {
  it("groups paragraphs into chunks", () => {
    const chunks = chunkPaperText("Para one.\n\nPara two.\n\nPara three.");
    assert.ok(chunks.length >= 1);
    assert.match(chunks.join("\n"), /Para one/);
    assert.match(chunks.join("\n"), /Para three/);
  });
});

describe("shouldRetrievePaper", () => {
  it("retrieves on paper page or paper-related queries", () => {
    assert.equal(shouldRetrievePaper("what color is physics?", {}), false);
    assert.equal(shouldRetrievePaper("summarize the paper", {}), true);
    assert.equal(
      shouldRetrievePaper("hello", { page: "paper" }),
      true
    );
  });
});

describe("retrievePaperForChat", () => {
  it("returns no chunks for unrelated queries", async () => {
    const out = await retrievePaperForChat("change physics to blue");
    assert.equal(out.openPaperText, "");
    assert.equal(out.retrievedChunks.length, 0);
  });

  it("retrieves chunks for paper questions", async () => {
    const out = await retrievePaperForChat(
      "What does the abstract say about NoteLMs?"
    );
    assert.ok(out.retrievedChunks.length >= 1);
    assert.match(
      out.retrievedChunks.map((c) => c.text).join("\n"),
      /NoteLMs|Abstract|student/i
    );
  });

  it("includes open paper text when on the paper page", async () => {
    const out = await retrievePaperForChat("overview", { uiContext: { page: "paper" } });
    assert.ok(out.openPaperText.length > 0);
    assert.match(out.openPaperText, /NoteLMs/i);
  });
});

describe("formatPaperForChat", () => {
  it("omits paper blocks when nothing retrieved", () => {
    assert.equal(formatPaperForChat({}), "");
  });

  it("formats open + retrieved paper", () => {
    const block = formatPaperForChat({
      openPaperText: "Title and abstract…",
      retrievedChunks: [{ index: 1, score: 2, text: "Methods section…" }],
    });
    assert.match(block, /OPEN PAPER/);
    assert.match(block, /RETRIEVED PAPER/);
    assert.match(block, /Methods section/);
  });
});
