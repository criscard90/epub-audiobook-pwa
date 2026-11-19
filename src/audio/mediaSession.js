/**
 * Media Session & Background Persistence
 * Integra Media Session API per controlli lock-screen/cuffie
 * e Wake Lock per impedire lo spegnimento schermo durante l'ascolto
 */

export class MediaSessionController {
  constructor(ttsEngine, storage, onPlay, onPause, onPrev, onNext, onSeekBackward, onSeekForward) {
    this.tts = ttsEngine;
    this.storage = storage;
    this.onPlay = onPlay;
    this.onPause = onPause;
    this.onPrev = onPrev;
    this.onNext = onNext;
    this.onSeekBackward = onSeekBackward;
    this.onSeekForward = onSeekForward;
    this.wakeLock = null;
    this.isWakeLockActive = false;
    this.silentAudio = null;

    this.initMediaSession();
  }

  initMediaSession() {
    if (!("mediaSession" in navigator)) return;

    const ms = navigator.mediaSession;

    ms.setActionHandler("play", () => {
      this.onPlay();
    });

    ms.setActionHandler("pause", () => {
      this.onPause();
    });

    ms.setActionHandler("previoustrack", () => {
      this.onPrev();
    });

    ms.setActionHandler("nexttrack", () => {
      this.onNext();
    });

    ms.setActionHandler("seekbackward", () => {
      this.onSeekBackward();
    });

    ms.setActionHandler("seekforward", () => {
      this.onSeekForward();
    });
  }

  updateMetadata(book, chapterTitle, coverUrl) {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: chapterTitle || book.title,
      artist: book.author,
      album: book.title,
      artwork: coverUrl ? [{ src: coverUrl, sizes: ["512x512"], type: "image/svg+xml" }] : [],
    });
  }

  async toggleWakeLock() {
    if (!("wakeLock" in window)) {
      console.warn("Wake Lock API non disponibile");
      return false;
    }

    if (this.isWakeLockActive) {
      await this.releaseWakeLock();
      return false;
    } else {
      await this.requestWakeLock();
      return true;
    }
  }

  async requestWakeLock() {
    try {
      this.wakeLock = await navigator.wakeLock.request("screen");
      this.isWakeLockActive = true;
      this.wakeLock.addEventListener("release", () => {
        this.isWakeLockActive = false;
      });
      this.startSilentAudio();
      console.log("Wake Lock attivo");
    } catch (err) {
      console.error("Errore Wake Lock:", err);
    }
  }

  async releaseWakeLock() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
    }
    this.isWakeLockActive = false;
    this.stopSilentAudio();
  }

  startSilentAudio() {
    if (this.silentAudio) return;
    this.silentAudio = new Audio();
    this.silentAudio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAA==";
    this.silentAudio.loop = true;
    this.silentAudio.volume = 0;
    this.silentAudio.play().catch(() => {});
  }

  stopSilentAudio() {
    if (this.silentAudio) {
      this.silentAudio.pause();
      this.silentAudio.src = "";
      this.silentAudio = null;
    }
  }

  async saveProgress(bookId, chapterIndex, chunkIndex) {
    try {
      const { getProgress, saveProgress } = await import("../db/storage.js");
      const existing = await getProgress(bookId);
      await saveProgress(bookId, {
        currentChapterIndex: chapterIndex,
        currentChunkIndex: chunkIndex,
        playbackRate: this.tts.playbackRate,
        voiceURI: this.tts.currentVoice ? this.tts.currentVoice.voiceURI : null,
      });
    } catch (e) {
      console.debug("Progress save deferred:", e);
    }
  }
}

export const mediaSession = null;