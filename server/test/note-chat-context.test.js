import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNotesChatSystemPrompt,
  capText,
  describeUiLocation,
  formatNavigationHint,
  formatUiContext,
  formatSubjectColorsForChat,
  parseSetSubjectColorAction,
  parseSetThemeAction,
  sameUiLocation,
  scoreHaystack,
  stripTrailingJsonObject,
  tokenizeQuery,
} from "../noteChatContext.js";
import { generateSummaryWithGptOss } from "../classify.js";

describe("tokenizeQuery / scoreHaystack", () => {
  it("tokenizes and scores lexical overlap", () => {
    const tokens = tokenizeQuery("Newton laws of motion");
    assert.ok(tokens.includes("newton"));
    assert.ok(tokens.includes("motion"));
    const score = scoreHaystack(
      tokens,
      "Newton's three laws of motion in classical mechanics"
    );
    assert.ok(score >= 2);
  });
});

describe("capText", () => {
  it("truncates long text", () => {
    const out = capText("abcdefghij", 5, "...");
    assert.equal(out, "abcde...");
  });
});

describe("sameUiLocation / formatNavigationHint", () => {
  it("treats same page+noteId as same location", () => {
    assert.equal(
      sameUiLocation(
        { page: "note", noteId: "a", noteTitle: "One" },
        { page: "note", noteId: "a", noteTitle: "Renamed" }
      ),
      true
    );
    assert.equal(
      sameUiLocation(
        { page: "note", noteId: "a" },
        { page: "note", noteId: "b" }
      ),
      false
    );
    assert.equal(
      sameUiLocation({ page: "home" }, { page: "library", subject: "Physics" }),
      false
    );
  });

  it("describes note locations and navigation moves", () => {
    assert.match(
      describeUiLocation({
        page: "note",
        noteId: "abc",
        noteTitle: "Kinematics",
        subject: "Physics",
      }),
      /Kinematics/
    );
    assert.match(
      formatNavigationHint(
        { page: "note", noteId: "b", noteTitle: "Forces" },
        { page: "note", noteId: "a", noteTitle: "Kinematics" }
      ),
      /User moved from/
    );
    assert.match(
      formatNavigationHint(
        { page: "note", noteId: "a" },
        { page: "note", noteId: "a" }
      ),
      /still on the same page/
    );
    assert.match(
      formatNavigationHint({ page: "note", noteId: "a" }, null),
      /First message/
    );
  });
});

describe("formatUiContext / buildNotesChatSystemPrompt", () => {
  it("includes screen, open note, and navigation hint", () => {
    const ui = formatUiContext(
      {
        page: "note",
        subject: "Physics",
        noteId: "abc",
        noteTitle: "Kinematics",
        theme: "dark",
        resolvedTheme: "dark",
      },
      { page: "note", noteId: "abc", noteTitle: "Kinematics" }
    );
    assert.match(ui, /CURRENT SCREEN: note/);
    assert.match(ui, /Physics/);
    assert.match(ui, /SITE THEME preference: dark/);
    assert.match(ui, /resolving to dark/);
    assert.match(ui, /still on the same page/);

    const system = buildNotesChatSystemPrompt({
      uiContext: {
        page: "note",
        subject: "Physics",
        noteId: "abc",
        noteTitle: "Kinematics",
        theme: "system",
        resolvedTheme: "light",
      },
      previousUiContext: {
        page: "note",
        noteId: "prev",
        noteTitle: "Old note",
      },
      openNoteText: "v = u + at",
      retrievedNotes: [
        {
          id: "x",
          title: "Forces",
          subject: "Physics",
          summary: "About forces",
          rawText: "F = ma",
        },
      ],
      researchMetricsText: "zero_shot: n=10, accuracy=0.500, macro_f1=0.400",
      subjectColorsText: formatSubjectColorsForChat({
        custom: ["APUSH"],
        colors: { APUSH: "#c45c26" },
      }),
    });
    assert.match(system, /OPEN NOTE/);
    assert.match(system, /v = u \+ at/);
    assert.match(system, /RETRIEVED NOTES/);
    assert.match(system, /F = ma/);
    assert.match(system, /ABOUT NOTELMS/);
    assert.match(system, /RESEARCH PAGE/);
    assert.match(system, /zero_shot/);
    assert.match(system, /SUBJECT COLORS/);
    assert.match(system, /APUSH: #c45c26/);
    assert.match(system, /set_subject_color/);
    assert.match(system, /set_theme/);
    assert.match(system, /SITE THEME preference: system/);
    assert.match(system, /User moved from/);
    assert.match(system, /still on the same page\/note/);
  });
});

describe("parseSetSubjectColorAction / stripTrailingJsonObject", () => {
  it("parses valid color actions and strips trailing JSON", () => {
    assert.deepEqual(
      parseSetSubjectColorAction({
        action: "set_subject_color",
        subject: "Biology",
        color: "#FF0000",
      }),
      { subject: "Biology", color: "#ff0000" }
    );
    assert.equal(
      parseSetSubjectColorAction({ action: "other", subject: "Biology" }),
      null
    );
    assert.equal(
      parseSetSubjectColorAction({
        action: "set_subject_color",
        subject: "Biology",
        color: "red",
      }),
      null
    );

    const stripped = stripTrailingJsonObject(
      'Done — Biology is now red.\n{"action":"set_subject_color","subject":"Biology","color":"#dc2626"}'
    );
    assert.equal(stripped, "Done — Biology is now red.");

    const fenced = stripTrailingJsonObject(
      'Updated.\n```json\n{"action":"set_subject_color","subject":"APUSH","color":"#112233"}\n```'
    );
    assert.equal(fenced, "Updated.");
  });
});

describe("parseSetThemeAction", () => {
  it("parses light/dark/system theme actions", () => {
    assert.deepEqual(parseSetThemeAction({ action: "set_theme", theme: "Dark" }), {
      theme: "dark",
    });
    assert.deepEqual(
      parseSetThemeAction({ action: "set_theme", preference: "system" }),
      { theme: "system" }
    );
    assert.equal(
      parseSetThemeAction({ action: "set_theme", theme: "blue" }),
      null
    );
    assert.equal(parseSetThemeAction({ action: "set_subject_color" }), null);
  });
});

describe("generateSummaryWithGptOss", () => {
  it("falls back for empty text without calling LM Studio", async () => {
    const summary = await generateSummaryWithGptOss("   ");
    assert.equal(summary, "");
  });
});
