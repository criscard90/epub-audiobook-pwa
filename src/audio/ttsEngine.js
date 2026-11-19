/**
 * TTS Engine - Strategia 1: Web Speech API con fix per Android/iOS
 * Predisposta per Strategia 2 (Kokoro/Piper) via toggle nelle impostazioni.
 */

const STRATEGY_SYSTEM = "system";
const STRATEGY_AI = "ai";

export class AudioNarrator {
  constructor() {
    this.strategy = STRATEGY_SYSTEM;
    this.synthesis = window.speechSynthesis;
    this.voices = [];
    this.currentVoice = null;
    this.currentBookId = null;
    this.currentChapterIndex = 0;
    this.currentChunkIndex = 0;
    this.chunks = [];
    this.playbackRate = 1.0;
    this.isPlaying = false;
    this.isPaused = false;
    this.utterance = null;
    this.keepAliveTimer = null;

    // Callbacks
    this.onChunkStart = null;
    this.onChunkEnd = null;
    this.onAllComplete = null;
    this.onError = null;

    this.initVoices();
  }

  initVoices() {
    this.voices = this.synthesis.getVoices();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = () => {
        this.voices = this.synthesis.getVoices();
      };
    }
  }

  setVoiceByLanguage(langCode) {
    let selected = null;

    // Priorità: voci locali di sistema per la lingua del libro
    const localVoices = this.voices.filter(
      (v) => v.lang && v.lang.startsWith(langCode.split("-")[0]) && v.localService
    );
    if (localVoices.length > 0) {
      selected = localVoices[0];
    } else {
      // Fallback: qualsiasi voce per quella lingua
      const anyVoices = this.voices.filter(
        (v) => v.lang && v.lang.startsWith(langCode.split("-")[0])
      );
      if (anyVoices.length > 0) {
        selected = anyVoices[0];
      } else {
        selected = this.voices[0] || null;
      }
    }

    this.currentVoice = selected;
    return selected;
  }

  getVoices() {
    return this.voices;
  }

  setStrategy(strategy) {
    this.strategy = strategy;
    this.stop();
  }

  async loadBook(bookId, chapterIndex, chunks, options = {}) {
    this.stop();
    this.currentBookId = bookId;
    this.currentChapterIndex = chapterIndex;
    this.currentChunkIndex = options.currentChunkIndex || 0;
    this.chunks = chunks;
    this.playbackRate = options.playbackRate || 1.0;
    this.currentVoice = options.voice || this.currentVoice;
    this.isPaused = false;
    this.isPlaying = false;
  }

  async play() {
    if (this.chunks.length === 0) return;
    if (this.isPlaying && !this.isPaused) return;

    this.isPlaying = true;
    this.isPaused = false;

    if (this.strategy === STRATEGY_AI) {
      this.playAI();
    } else {
      this.playSystem(this.currentChunkIndex);
    }
  }

  pause() {
    this.isPaused = true;
    this.isPlaying = false;
    this.clearKeepAlive();
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentChunkIndex = 0;
    this.clearKeepAlive();
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.utterance = null;
  }

  async playSystem(startIndex = 0) {
    if (!this.synthesis) {
      if (this.onError) this.onError("Web Speech API non disponibile");
      return;
    }

    this.synthesis.cancel();

    const speakNext = (index) => {
      if (!this.isPlaying || index >= this.chunks.length) {
        this.isPlaying = false;
        if (this.onAllComplete) this.onAllComplete();
        return;
      }

      if (this.isPaused) return;

      const chunk = this.chunks[index];
      this.currentChunkIndex = index;

      if (this.onChunkStart) {
        this.onChunkStart(index, chunk.text, this.currentChapterIndex);
      }

      this.utterance = new SpeechSynthesisUtterance(chunk.text);
      this.utterance.lang = this.currentVoice?.lang || "it-IT";
      this.utterance.voice = this.currentVoice;
      this.utterance.rate = this.playbackRate;
      this.utterance.volume = 1.0;

      this.utterance.onend = () => {
        this.utterance = null;
        // Keep-alive: piccolo delay prima del prossimo chunk per evitare freeze su Android
        setTimeout(() => {
          speakNext(index + 1);
        }, 50);
      };

      this.utterance.onerror = (e) => {
        console.error("Errore TTS:", e);
        this.utterance = null;
        // Salta al chunk successivo in caso di errore
        setTimeout(() => {
          speakNext(index + 1);
        }, 50);
      };

      this.synthesis.speak(this.utterance);
      this.startKeepAlive();
    };

    speakNext(startIndex);
  }

  async playAI() {
    // Placeholder per Strategia 2 (Kokoro/Piper WASM)
    console.warn("Strategia AI non ancora implementata");
    if (this.onError) this.onError("Motore AI non disponibile");
  }

  startKeepAlive() {
    this.clearKeepAlive();
    // Timer keep-alive: pausa/riprende ogni 10 secondi per prevenire freeze su Chrome/Android
    this.keepAliveTimer = setInterval(() => {
      if (this.synthesis && this.synthesis.speaking && !this.isPaused) {
        try {
          this.synthesis.pause();
          setTimeout(() => this.synthesis.resume(), 100);
        } catch (e) {
          console.debug("Keep-alive TTS:", e);
        }
      }
    }, 10000);
  }

  clearKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  skipChunks(delta) {
    const newIndex = this.currentChunkIndex + delta;
    if (newIndex < 0) return;
    if (newIndex >= this.chunks.length) return;
    this.currentChunkIndex = newIndex;
    if (this.isPlaying) {
      this.play(this.currentChunkIndex);
    }
  }

  previousChapter() {
    // Gestito dal player view
  }

  nextChapter() {
    // Gestito dal player view
  }

  destroy() {
    this.stop();
    this.clearKeepAlive();
  }
}

// Singleton
export const ttsEngine = new AudioNarrator();