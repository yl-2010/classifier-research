/**
 * Web Audio playback + lyrics sync for Orpheus TTS NDJSON streams.
 * Ported from lm_studio_pasted_text_to_speech/static/index.html
 */

export type VoicePlayerUi = {
  status: string;
  statusKind: "" | "ok" | "error";
  progressDone: number;
  progressTotal: number;
  progressVisible: boolean;
  mediaVisible: boolean;
  lyricsVisible: boolean;
  speakDisabled: boolean;
  stopVisible: boolean;
  playLabel: string;
  playDisabled: boolean;
  rewindDisabled: boolean;
  playbackTime: string;
  playbackHeardLabel: string;
  playbackBarMax: number;
  playbackBarValue: number;
  playbackBarDisabled: boolean;
  lyricsHtml: string;
};

type SourceToken = {
  text: string;
  leading: string;
  chunkIndex: number | null;
  wordIndex: number | null;
  startSec: number | null;
  endSec: number | null;
};

type LyricChunk = {
  text: string;
  duration: number | null;
  startSec: number;
  endSec: number;
  words: SourceToken[];
};

type Segment = {
  buffer: AudioBuffer;
  startSec: number;
  chunkIndex: number | null;
};

const CHUNK_GAP_SEC = 0.25;

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tokenizeSourceText(text: string) {
  const tokens: SourceToken[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      leading: text.slice(lastEnd, match.index),
      chunkIndex: null,
      wordIndex: null,
      startSec: null,
      endSec: null,
    });
    lastEnd = match.index + match[0].length;
  }
  return { tokens, trailing: text.slice(lastEnd) };
}

function tokenizeChunkText(text: string) {
  const tokens: { text: string; leading: string }[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  let lastEnd = 0;
  while ((match = re.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      leading: text.slice(lastEnd, match.index),
    });
    lastEnd = match.index + match[0].length;
  }
  return tokens;
}

export function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export class OrpheusVoicePlayer {
  private onUi: (ui: VoicePlayerUi) => void;
  private audioContext: AudioContext | null = null;
  private abortController: AbortController | null = null;
  private playbackSession = 0;
  private streamEnded = false;
  private pendingDecodeCount = 0;

  private segments: Segment[] = [];
  private generatedDuration = 0;
  private playhead = 0;
  private maxPlayhead = 0;
  private isPlaying = false;
  private isPaused = false;
  private waitingForBuffer = false;
  private currentSource: AudioBufferSourceNode | null = null;
  private playAnchor = { ctxTime: 0, position: 0 };
  private positionRaf: number | null = null;
  private isScrubbing = false;
  private wasPlayingBeforeScrub = false;
  private gapTimeout: ReturnType<typeof setTimeout> | null = null;

  private lyricChunks: (LyricChunk | null)[] = [];
  private lyricWords: SourceToken[] = [];
  private sourceTokens: SourceToken[] = [];
  private sourceTrailing = "";
  private sourceAssignCursor = 0;
  private lastLyricsScrollWord = -1;
  private lyricsHtml = "";

  private status = "";
  private statusKind: "" | "ok" | "error" = "";
  private progressDone = 0;
  private progressTotal = 0;
  private progressVisible = false;
  private mediaVisible = false;
  private lyricsVisible = false;
  private speakDisabled = false;
  private stopVisible = false;

  constructor(onUi: (ui: VoicePlayerUi) => void) {
    this.onUi = onUi;
    this.emit();
  }

  getUi(): VoicePlayerUi {
    const live = this.getLivePosition();
    const maxSeek = this.getMaxSeekTime(live);
    return {
      status: this.status,
      statusKind: this.statusKind,
      progressDone: this.progressDone,
      progressTotal: this.progressTotal,
      progressVisible: this.progressVisible,
      mediaVisible: this.mediaVisible,
      lyricsVisible: this.lyricsVisible,
      speakDisabled: this.speakDisabled,
      stopVisible: this.stopVisible,
      playLabel: this.isPlaying && !this.isPaused ? "Pause" : "Play",
      playDisabled: this.generatedDuration <= 0,
      rewindDisabled: live <= 0 && this.playhead <= 0,
      playbackTime: `${formatTime(live)} / ${formatTime(this.generatedDuration)}`,
      playbackHeardLabel: `Heard up to ${formatTime(this.maxPlayhead)}`,
      playbackBarMax: Math.max(maxSeek, 0.01),
      playbackBarValue: this.isScrubbing
        ? this.playhead
        : Math.min(live, maxSeek),
      playbackBarDisabled: this.maxPlayhead <= 0 && maxSeek <= 0,
      lyricsHtml: this.lyricsHtml,
    };
  }

  private emit() {
    this.onUi(this.getUi());
  }

  setStatus(message: string, kind: "" | "ok" | "error" = "") {
    this.status = message;
    this.statusKind = kind;
    this.emit();
  }

  private setProgress(done: number, total: number) {
    if (total <= 1) {
      this.progressVisible = false;
      this.emit();
      return;
    }
    this.progressVisible = true;
    this.progressTotal = total;
    this.progressDone = done;
    this.emit();
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    }
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }

  private getLivePosition() {
    if (
      this.isPlaying &&
      !this.isPaused &&
      this.audioContext &&
      (this.currentSource || this.gapTimeout)
    ) {
      return (
        this.playAnchor.position +
        (this.audioContext.currentTime - this.playAnchor.ctxTime)
      );
    }
    return this.playhead;
  }

  private clearGapTimeout() {
    if (this.gapTimeout) {
      clearTimeout(this.gapTimeout);
      this.gapTimeout = null;
    }
  }

  private stopCurrentSource() {
    this.clearGapTimeout();
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* ignore */
      }
      this.currentSource.onended = null;
      this.currentSource = null;
    }
  }

  private cancelPositionLoop() {
    if (this.positionRaf != null) {
      cancelAnimationFrame(this.positionRaf);
      this.positionRaf = null;
    }
  }

  private startPositionLoop(session: number) {
    this.cancelPositionLoop();
    const tick = () => {
      if (session !== this.playbackSession) return;
      if (this.isPlaying && !this.isPaused) {
        this.maxPlayhead = Math.max(this.maxPlayhead, this.getLivePosition());
      }
      this.updateLyricsHighlight();
      this.emit();
      if (this.isPlaying && !this.isPaused && !this.isScrubbing) {
        this.positionRaf = requestAnimationFrame(tick);
      }
    };
    this.positionRaf = requestAnimationFrame(tick);
  }

  private findSegmentAt(time: number) {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      const end = seg.startSec + seg.buffer.duration;
      if (time >= seg.startSec - 0.001 && time < end - 0.001) {
        return { index: i, offset: time - seg.startSec };
      }
    }
    return null;
  }

  private getSegmentBoundsAt(time: number) {
    const hit = this.findSegmentAt(time);
    if (hit) {
      const seg = this.segments[hit.index];
      return {
        startSec: seg.startSec,
        endSec: seg.startSec + seg.buffer.duration,
        chunkIndex: seg.chunkIndex,
      };
    }

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (time < seg.startSec - 0.001) {
        if (i > 0) {
          const prev = this.segments[i - 1];
          return {
            startSec: prev.startSec,
            endSec: prev.startSec + prev.buffer.duration,
            chunkIndex: prev.chunkIndex,
          };
        }
        return {
          startSec: seg.startSec,
          endSec: seg.startSec + seg.buffer.duration,
          chunkIndex: seg.chunkIndex,
        };
      }
    }

    if (this.segments.length > 0) {
      const last = this.segments[this.segments.length - 1];
      return {
        startSec: last.startSec,
        endSec: last.startSec + last.buffer.duration,
        chunkIndex: last.chunkIndex,
      };
    }
    return null;
  }

  private clampSeekTarget(target: number, referencePosition: number) {
    target = Math.max(0, target);
    if (target <= this.maxPlayhead) return target;
    const bounds = this.getSegmentBoundsAt(referencePosition);
    if (!bounds) return this.maxPlayhead;
    return Math.min(target, bounds.endSec);
  }

  private getMaxSeekTime(referencePosition: number) {
    const bounds = this.getSegmentBoundsAt(referencePosition);
    const chunkEnd = bounds ? bounds.endSec : this.maxPlayhead;
    return Math.max(this.maxPlayhead, chunkEnd);
  }

  private scheduleGapThen(fromSec: number, targetSec: number, session: number) {
    const ctx = this.ensureAudioContext();
    this.clearGapTimeout();
    this.stopCurrentSource();

    const waitMs = Math.max(0, (targetSec - fromSec) * 1000);
    this.playhead = fromSec;
    this.playAnchor = { ctxTime: ctx.currentTime, position: fromSec };
    this.waitingForBuffer = false;
    this.startPositionLoop(session);

    this.gapTimeout = setTimeout(() => {
      this.gapTimeout = null;
      if (session !== this.playbackSession || !this.isPlaying || this.isPaused)
        return;
      this.playhead = targetSec;
      this.scheduleFromPosition(targetSec, session);
    }, waitMs);
  }

  private scheduleFromPosition(fromSec: number, session: number) {
    if (session !== this.playbackSession || !this.isPlaying || this.isPaused)
      return;

    const hit = this.findSegmentAt(fromSec);
    if (!hit) {
      for (let i = 0; i < this.segments.length; i++) {
        if (fromSec < this.segments[i].startSec - 0.001) {
          this.scheduleGapThen(fromSec, this.segments[i].startSec, session);
          return;
        }
      }
      this.waitingForBuffer = true;
      return;
    }

    const ctx = this.ensureAudioContext();
    this.stopCurrentSource();

    const seg = this.segments[hit.index];
    const offset = Math.max(
      0,
      Math.min(hit.offset, seg.buffer.duration - 0.001)
    );

    const source = ctx.createBufferSource();
    source.buffer = seg.buffer;
    source.connect(ctx.destination);
    source.start(ctx.currentTime, offset);

    this.currentSource = source;
    this.playAnchor = {
      ctxTime: ctx.currentTime,
      position: seg.startSec + offset,
    };
    this.playhead = this.playAnchor.position;
    this.waitingForBuffer = false;
    this.startPositionLoop(session);

    source.onended = () => {
      if (session !== this.playbackSession || !this.isPlaying || this.isPaused)
        return;
      this.currentSource = null;

      const nextStart = seg.startSec + seg.buffer.duration;
      this.playhead = nextStart;
      this.maxPlayhead = Math.max(this.maxPlayhead, nextStart);

      if (nextStart < this.generatedDuration - 0.001) {
        this.scheduleFromPosition(nextStart, session);
      } else if (
        this.streamEnded &&
        nextStart >= this.generatedDuration - 0.001
      ) {
        this.isPlaying = false;
        this.isPaused = false;
        this.playhead = this.generatedDuration;
        this.maxPlayhead = Math.max(this.maxPlayhead, this.generatedDuration);
        this.emit();
        this.maybeFinishSession(session);
      } else {
        this.waitingForBuffer = true;
        this.emit();
      }
    };
  }

  private startPlaying(session: number) {
    if (session !== this.playbackSession || this.generatedDuration <= 0) return;
    this.isPlaying = true;
    this.isPaused = false;
    this.scheduleFromPosition(this.playhead, session);
    this.emit();
  }

  pausePlaying() {
    if (!this.isPlaying || this.isPaused) return;
    this.playhead = this.getLivePosition();
    this.maxPlayhead = Math.max(this.maxPlayhead, this.playhead);
    this.isPaused = true;
    this.stopCurrentSource();
    this.waitingForBuffer = false;
    this.emit();
  }

  resumePlaying(session = this.playbackSession) {
    if (!this.isPlaying) {
      this.startPlaying(session);
      return;
    }
    if (!this.isPaused) return;
    this.isPaused = false;
    this.scheduleFromPosition(this.playhead, session);
    this.emit();
  }

  togglePlayPause() {
    if (this.isPlaying && !this.isPaused) {
      this.pausePlaying();
    } else {
      this.resumePlaying();
    }
  }

  seekTo(seconds: number, session = this.playbackSession) {
    const live = this.getLivePosition();
    const target = this.clampSeekTarget(seconds, live);
    this.playhead = target;
    this.maxPlayhead = Math.max(this.maxPlayhead, target);
    this.stopCurrentSource();
    this.waitingForBuffer = false;
    this.lastLyricsScrollWord = -1;

    if (this.isPlaying && !this.isPaused) {
      this.scheduleFromPosition(this.playhead, session);
    }
    this.updateLyricsHighlight();
    this.emit();
  }

  rewindFiveSeconds() {
    const live = this.getLivePosition();
    this.seekTo(Math.max(0, live - 5));
  }

  beginScrub() {
    this.isScrubbing = true;
    this.wasPlayingBeforeScrub = this.isPlaying && !this.isPaused;
    if (this.wasPlayingBeforeScrub) {
      this.pausePlaying();
    }
  }

  scrubTo(value: number) {
    const live = this.getLivePosition();
    const target = this.clampSeekTarget(value, live);
    this.playhead = target;
    this.updateLyricsHighlight();
    this.emit();
  }

  endScrub(value: number) {
    this.seekTo(value);
    this.isScrubbing = false;
    if (this.wasPlayingBeforeScrub) {
      this.resumePlaying();
    }
    this.wasPlayingBeforeScrub = false;
  }

  private resetPlaybackState() {
    this.stopCurrentSource();
    this.clearGapTimeout();
    this.cancelPositionLoop();
    this.segments = [];
    this.generatedDuration = 0;
    this.playhead = 0;
    this.maxPlayhead = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.waitingForBuffer = false;
    this.playAnchor = { ctxTime: 0, position: 0 };
    this.isScrubbing = false;
    this.wasPlayingBeforeScrub = false;
    this.lyricChunks = [];
    this.lyricWords = [];
    this.sourceTokens = [];
    this.sourceTrailing = "";
    this.sourceAssignCursor = 0;
    this.lastLyricsScrollWord = -1;
    this.lyricsHtml = "";
  }

  stopPlayback() {
    this.playbackSession += 1;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.resetPlaybackState();
    this.streamEnded = false;
    this.stopVisible = false;
    this.speakDisabled = false;
    this.progressVisible = false;
    this.mediaVisible = false;
    this.lyricsVisible = false;
    this.emit();
  }

  private initSourceText(text: string) {
    const parsed = tokenizeSourceText(text);
    this.sourceTokens = parsed.tokens;
    this.sourceTrailing = parsed.trailing;
    this.sourceAssignCursor = 0;
  }

  private assignSourceWordChunks(chunkIndex: number, chunkText: string) {
    const chunkTokens = tokenizeChunkText(chunkText);
    let wordIndex = 0;

    for (const chunkToken of chunkTokens) {
      while (this.sourceAssignCursor < this.sourceTokens.length) {
        const sourceToken = this.sourceTokens[this.sourceAssignCursor];
        this.sourceAssignCursor += 1;
        if (sourceToken.text === chunkToken.text) {
          sourceToken.chunkIndex = chunkIndex;
          sourceToken.wordIndex = wordIndex;
          wordIndex += 1;
          break;
        }
      }
    }
  }

  private registerLyricChunk(index: number, text: string) {
    while (this.lyricChunks.length <= index) {
      this.lyricChunks.push(null);
    }
    this.lyricChunks[index] = {
      text,
      duration: null,
      startSec: 0,
      endSec: 0,
      words: [],
    };
    this.assignSourceWordChunks(index, text);
  }

  private rebuildLyricTimeline() {
    this.lyricWords = [];
    let time = 0;

    for (let i = 0; i < this.lyricChunks.length; i++) {
      const chunk = this.lyricChunks[i];
      if (!chunk || chunk.duration == null) continue;

      if (i > 0 && this.lyricChunks[i - 1]?.duration != null) {
        time += CHUNK_GAP_SEC;
      }

      chunk.startSec = time;
      chunk.endSec = time + chunk.duration;

      const words = this.sourceTokens
        .filter((token) => token.chunkIndex === i)
        .sort((a, b) => (a.wordIndex ?? 0) - (b.wordIndex ?? 0));
      const wordCount = Math.max(words.length, 1);

      chunk.words = words.map((word, wi) => {
        word.startSec = time + (wi / wordCount) * chunk.duration!;
        word.endSec = time + ((wi + 1) / wordCount) * chunk.duration!;
        this.lyricWords.push(word);
        return word;
      });

      time += chunk.duration;
    }
  }

  private renderLyricsView() {
    if (!this.sourceTokens.length) {
      this.lyricsHtml = "";
      return;
    }

    const wordHtml = this.sourceTokens
      .map((word) => {
        const chunkClass =
          word.chunkIndex == null
            ? ""
            : word.chunkIndex % 2 === 0
              ? "chunk-a"
              : "chunk-b";
        const chunkAttr =
          word.chunkIndex == null ? "" : ` data-chunk="${word.chunkIndex}"`;
        const wordAttr =
          word.wordIndex == null ? "" : ` data-word="${word.wordIndex}"`;
        return `<span class="lyrics-word future ${chunkClass}"${chunkAttr}${wordAttr}>${escapeHtml(word.leading)}${escapeHtml(word.text)}</span>`;
      })
      .join("");

    this.lyricsHtml = `<div class="lyrics-body">${wordHtml}${escapeHtml(this.sourceTrailing)}</div>`;
  }

  private findCurrentWordIndex(position: number) {
    if (!this.lyricWords.length) return -1;
    for (let i = 0; i < this.lyricWords.length; i++) {
      if (position < (this.lyricWords[i].endSec ?? 0) - 0.001) {
        return i;
      }
    }
    return this.lyricWords.length - 1;
  }

  private updateLyricsHighlight() {
    if (!this.lyricsVisible || typeof document === "undefined") return;

    const scrollEl = document.getElementById("voice-lyrics-scroll");
    if (!scrollEl) return;

    const position = this.getLivePosition();
    const currentIndex = this.findCurrentWordIndex(position);
    const wordEls = scrollEl.querySelectorAll(".lyrics-word");
    let scrollTarget: Element | null = null;

    wordEls.forEach((el) => {
      const chunkIndex = parseInt(
        (el as HTMLElement).dataset.chunk ?? "",
        10
      );
      const wordIndex = parseInt((el as HTMLElement).dataset.word ?? "", 10);
      const word =
        Number.isNaN(chunkIndex) || Number.isNaN(wordIndex)
          ? null
          : (this.lyricChunks[chunkIndex]?.words?.[wordIndex] ?? null);

      el.classList.remove("spoken", "current", "future", "seekable");

      if (!word || word.endSec == null) {
        el.classList.add("future");
        return;
      }

      const globalIndex = this.lyricWords.indexOf(word);
      if (globalIndex < currentIndex) {
        el.classList.add("spoken", "seekable");
      } else if (globalIndex === currentIndex) {
        el.classList.add("spoken", "current");
        scrollTarget = el;
      } else {
        el.classList.add("future");
      }
    });

    if (scrollTarget && currentIndex !== this.lastLyricsScrollWord) {
      this.lastLyricsScrollWord = currentIndex;
      (scrollTarget as HTMLElement).scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  private setLyricChunkDuration(index: number, duration: number) {
    if (!this.lyricChunks[index]) return;
    this.lyricChunks[index]!.duration = duration;
    this.rebuildLyricTimeline();
    this.renderLyricsView();
    this.emit();
    // Highlight after DOM paints new lyricsHtml
    requestAnimationFrame(() => this.updateLyricsHighlight());
  }

  seekToWord(chunkIndex: number, wordIndex: number) {
    const word = this.lyricChunks[chunkIndex]?.words?.[wordIndex];
    if (!word || word.startSec == null) return;

    const position = this.getLivePosition();
    const currentIndex = this.findCurrentWordIndex(position);
    const targetIndex = this.lyricWords.indexOf(word);
    if (targetIndex < 0) return;

    if (targetIndex > currentIndex) {
      const bounds = this.getSegmentBoundsAt(position);
      if (!bounds || chunkIndex !== bounds.chunkIndex) return;
      if (word.startSec > bounds.endSec - 0.001) return;
    }

    const session = this.playbackSession;
    const wasPlaying = this.isPlaying && !this.isPaused;
    if (wasPlaying) this.pausePlaying();
    this.seekTo(word.startSec, session);
    this.lastLyricsScrollWord = -1;
    if (wasPlaying) this.resumePlaying(session);
  }

  private async appendChunk(
    arrayBuffer: ArrayBuffer,
    session: number,
    chunkIndex: number | null = null
  ) {
    const ctx = this.ensureAudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    if (session !== this.playbackSession) return;

    if (this.segments.length > 0) {
      this.generatedDuration += CHUNK_GAP_SEC;
    }
    this.segments.push({
      buffer: audioBuffer,
      startSec: this.generatedDuration,
      chunkIndex,
    });
    this.generatedDuration += audioBuffer.duration;

    if (chunkIndex != null) {
      this.setLyricChunkDuration(chunkIndex, audioBuffer.duration);
    }

    if (this.isPlaying && !this.isPaused && this.waitingForBuffer) {
      this.scheduleFromPosition(this.playhead, session);
    }

    this.emit();
  }

  private maybeFinishSession(session: number) {
    if (session !== this.playbackSession) return;
    if (
      this.streamEnded &&
      !this.isPlaying &&
      !this.isPaused &&
      this.pendingDecodeCount === 0
    ) {
      this.speakDisabled = false;
      this.stopVisible = false;
      this.abortController = null;
      this.emit();
    }
  }

  async speak(opts: {
    text: string;
    rawText: string;
    voice: string;
    fetchStream: (
      body: { text: string; voice: string },
      signal: AbortSignal
    ) => Promise<Response>;
  }) {
    const text = opts.text.trim();
    if (!text) {
      this.setStatus("Enter some text first.", "error");
      return;
    }

    this.stopPlayback();
    const session = this.playbackSession;
    this.abortController = new AbortController();
    this.streamEnded = false;
    this.pendingDecodeCount = 0;

    this.speakDisabled = true;
    this.stopVisible = true;
    this.lyricsVisible = true;
    this.mediaVisible = true;
    this.initSourceText(opts.rawText);
    this.lyricChunks = [];
    this.lyricWords = [];
    this.lastLyricsScrollWord = -1;
    this.renderLyricsView();
    this.setProgress(0, 100);
    this.setStatus("Generating first chunk…");

    let totalChunks = 0;
    let receivedChunks = 0;
    let autoStarted = false;

    try {
      const res = await opts.fetchStream(
        { text, voice: opts.voice },
        this.abortController.signal
      );

      if (!res.ok) {
        const err = (await res.json().catch(() => ({
          error: res.statusText,
        }))) as { error?: string };
        throw new Error(err.error || "Synthesis failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (session !== this.playbackSession) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            total?: number;
            index?: number;
            text?: string;
            audio?: string;
            message?: string;
          };

          if (event.type === "start") {
            totalChunks = event.total ?? 0;
            this.setProgress(0, totalChunks);
            this.lyricChunks = new Array(totalChunks).fill(null);
            this.setStatus(
              totalChunks === 1
                ? "Generating speech…"
                : `Split into ${totalChunks} chunks. Generating chunk 1…`
            );
          }

          if (event.type === "chunk") {
            receivedChunks = (event.index ?? 0) + 1;
            this.setProgress(receivedChunks, event.total ?? totalChunks);

            this.registerLyricChunk(event.index ?? 0, event.text || "");
            this.renderLyricsView();
            this.emit();

            this.pendingDecodeCount += 1;
            void this.appendChunk(
              base64ToArrayBuffer(event.audio || ""),
              session,
              event.index ?? null
            ).finally(() => {
              this.pendingDecodeCount -= 1;
              if (
                !autoStarted &&
                this.generatedDuration > 0 &&
                session === this.playbackSession
              ) {
                autoStarted = true;
                this.startPlaying(session);
              }
              this.maybeFinishSession(session);
            });

            const bufferedAhead = Math.max(
              0,
              this.generatedDuration - this.maxPlayhead
            );
            if (receivedChunks < (event.total ?? 0)) {
              this.setStatus(
                `Generated ${receivedChunks} of ${event.total} (${formatTime(bufferedAhead)} buffered ahead) — LM Studio on next chunk…`,
                "ok"
              );
            } else {
              this.setStatus(
                `Generated ${receivedChunks} of ${event.total} (${formatTime(bufferedAhead)} buffered ahead)…`,
                "ok"
              );
            }
          }

          if (event.type === "error") {
            this.streamEnded = true;
            throw new Error(event.message || "TTS error");
          }

          if (event.type === "done") {
            this.streamEnded = true;
            this.setProgress(totalChunks, totalChunks);
            this.setStatus(
              `All ${totalChunks} chunk${totalChunks === 1 ? "" : "s"} generated. ${this.isPlaying && !this.isPaused ? "Finishing playback…" : "Press play to continue."}`,
              "ok"
            );
          }
        }
      }

      this.streamEnded = true;
      this.maybeFinishSession(session);

      if (session === this.playbackSession && this.streamEnded) {
        const checkDone = () => {
          if (session !== this.playbackSession) return;
          if (this.isPlaying && !this.isPaused) {
            setTimeout(checkDone, 300);
            return;
          }
          if (
            this.maxPlayhead >= this.generatedDuration - 0.05 &&
            this.pendingDecodeCount === 0
          ) {
            this.speakDisabled = false;
            this.stopVisible = false;
            this.abortController = null;
            this.setStatus(
              `Finished speaking all ${totalChunks || 1} chunk${totalChunks === 1 ? "" : "s"}.`,
              "ok"
            );
          }
        };
        checkDone();
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.name !== "AbortError" &&
        session === this.playbackSession
      ) {
        this.setStatus(err.message, "error");
        this.speakDisabled = false;
        this.stopVisible = false;
      }
    }
  }

  dispose() {
    this.stopPlayback();
  }
}
