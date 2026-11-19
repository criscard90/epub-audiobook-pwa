/**
 * Player View - Schermata player con controlli audio, testo karaoke e sleep timer
 */

import { ttsEngine } from "../audio/ttsEngine.js";
import { MediaSessionController } from "../audio/mediaSession.js";
import { getBook, getChapters, getProgress, saveProgress } from "../db/storage.js";

let mediaSessionCtrl = null;
let sleepTimer = null;
let sleepTimerMinutes = 0;
let animationFrame = null;

export function initPlayerView(container, appState, navigateTo) {
  const bookId = appState.activeBookId;
  if (!bookId) {
    navigateTo("library");
    return;
  }
  setupEventListeners(container, appState, navigateTo);
  loadBookAndStart(bookId, container, appState, navigateTo);
}

async function loadBookAndStart(bookId, container, appState, navigateTo) {
  const book = await getBook(bookId);
  const chapters = await getChapters(bookId);
  const progress = await getProgress(bookId);
  if (!book) { navigateTo("library"); return; }

  container.querySelector("#book-title").textContent = book.title;
  container.querySelector("#book-author").textContent = book.author;

  const coverEl = container.querySelector("#cover-img");
  const coverPlaceholder = container.querySelector("#cover-placeholder");
  if (book.coverUrl) {
    coverEl.src = book.coverUrl;
    coverEl.classList.remove("hidden");
    coverPlaceholder.classList.add("hidden");
  } else {
    coverEl.classList.add("hidden");
    coverPlaceholder.classList.remove("hidden");
  }

  const startChapter = progress ? progress.currentChapterIndex : 0;
  const startChunk = progress ? progress.currentChunkIndex : 0;
  if (chapters.length === 0) {
    container.querySelector("#book-chapter").textContent = "Nessun capitolo disponibile";
    return;
  }
  loadChapter(container, book, chapters, startChapter, startChunk);

  const currentChapter = chapters[startChapter];
  mediaSessionCtrl = new MediaSessionController(
    ttsEngine, null,
    () => playPause(container),
    () => playPause(container),
    () => prevChapter(container, book, chapters, appState),
    () => nextChapter(container, book, chapters, appState),
    () => skipBackward(container),
    () => skipForward(container)
  );
  mediaSessionCtrl.updateMetadata(book, currentChapter.title, book.coverUrl);
  populateVoiceSelect(container);
}

function loadChapter(container, book, chapters, chapterIndex, chunkIndex) {
  const chapter = chapters[chapterIndex];
  if (!chapter) return;

  container.querySelector("#book-chapter").textContent = chapter.title;
  container.querySelector("#cover-chapter-title").textContent = chapter.title;
  container.querySelector("#cover-chapter-num").textContent = chapterIndex + 1;
  container.querySelector("#cover-chapter-total").textContent = chapters.length;

  const chunks = chapter.chunks;
  container.querySelector("#chunk-counter").textContent = `${Math.min(chunkIndex + 1, chunks.length)} / ${chunks.length}`;

  const progressPct = chunks.length > 0 ? ((chunkIndex / chunks.length) * 100).toFixed(1) : 0;
  container.querySelector("#chapter-progress-fill").style.width = `${progressPct}%`;

  const karaokeEl = container.querySelector("#karaoke-text");
  karaokeEl.innerHTML = chunks.map((c, i) => `
    <div class="karaoke-chunk ${i === chunkIndex ? 'active' : ''}" data-chunk-index="${i}">${c.text}</div>
  `).join("");

  karaokeEl.querySelectorAll(".karaoke-chunk").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.getAttribute("data-chunk-index"));
      jumpToChunk(container, idx, chapterIndex, chapters);
    });
  });

  scrollToChunk(container, chunkIndex);

  if (mediaSessionCtrl) {
    mediaSessionCtrl.updateMetadata(book, chapter.title, book.coverUrl);
  }

  saveProgress(book.bookId, { currentChapterIndex: chapterIndex, currentChunkIndex: chunkIndex });
}

function setupEventListeners(container, appState, navigateTo) {
  container.querySelector("#btn-back-library").addEventListener("click", () => {
    ttsEngine.stop();
    clearSleepTimer();
    cancelAnimationFrame(animationFrame);
    navigateTo("library");
  });

  container.querySelector("#btn-chapters-menu").addEventListener("click", () => {
    showChaptersModal(container, appState);
  });

  const btnPlay = container.querySelector("#btn-play-pause");
  btnPlay.addEventListener("click", () => playPause(container));

  container.querySelector("#btn-prev-chapter").addEventListener("click", () => {
    const bookId = appState.activeBookId;
    getBook(bookId).then(b => getChapters(bookId).then(ch => {
      if (ttsEngine.currentChapterIndex > 0) prevChapter(container, b, ch, appState);
    }));
  });

  container.querySelector("#btn-next-chapter").addEventListener("click", () => {
    const bookId = appState.activeBookId;
    getBook(bookId).then(b => getChapters(bookId).then(ch => {
      if (ttsEngine.currentChapterIndex < ch.length - 1) nextChapter(container, b, ch, appState);
    }));
  });

  container.querySelector("#btn-back-15s").addEventListener("click", () => skipBackward(container));
  container.querySelector("#btn-forward-15s").addEventListener("click", () => skipForward(container));

  container.querySelector("#select-speed").addEventListener("change", (e) => {
    ttsEngine.playbackRate = parseFloat(e.target.value);
    if (ttsEngine.isPlaying) ttsEngine.play(ttsEngine.currentChunkIndex);
  });

  container.querySelector("#select-voice").addEventListener("change", (e) => {
    const voice = ttsEngine.getVoices().find(v => v.voiceURI === e.target.value);
    if (voice) {
      ttsEngine.currentVoice = voice;
      if (ttsEngine.isPlaying) ttsEngine.play(ttsEngine.currentChunkIndex);
    }
  });

  container.querySelector("#select-sleep-timer").addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "0") { clearSleepTimer(); sleepTimerMinutes = 0; }
    else if (val === "-1") { clearSleepTimer(); sleepTimerMinutes = -1; }
    else { clearSleepTimer(); sleepTimerMinutes = parseInt(val); startSleepTimer(container); }
  });

  const btnWakeLock = container.querySelector("#btn-wake-lock");
  btnWakeLock.addEventListener("click", async () => {
    const active = await mediaSessionCtrl.toggleWakeLock();
    btnWakeLock.classList.toggle("bg-accent-500", active);
    btnWakeLock.classList.toggle("text-dark-900", active);
    btnWakeLock.classList.toggle("text-slate-300", !active);
  });

  container.querySelector("#btn-view-cover").addEventListener("click", () => {
    container.querySelector("#mode-cover").classList.remove("hidden");
    container.querySelector("#mode-text").classList.add("hidden");
    container.querySelector("#btn-view-cover").classList.add("active", "text-accent-400", "border-accent-500/30");
    container.querySelector("#btn-view-cover").classList.remove("bg-slate-800/50", "text-slate-300");
    container.querySelector("#btn-view-text").classList.remove("active", "text-accent-400", "border-accent-500/30");
    container.querySelector("#btn-view-text").classList.add("bg-slate-800/50", "text-slate-300");
  });

  container.querySelector("#btn-view-text").addEventListener("click", () => {
    container.querySelector("#mode-text").classList.remove("hidden");
    container.querySelector("#mode-cover").classList.add("hidden");
    container.querySelector("#btn-view-text").classList.add("active", "text-accent-400", "border-accent-500/30");
    container.querySelector("#btn-view-text").classList.remove("bg-slate-800/50", "text-slate-300");
    container.querySelector("#btn-view-cover").classList.remove("active", "text-accent-400", "border-accent-500/30");
    container.querySelector("#btn-view-cover").classList.add("bg-slate-800/50", "text-slate-300");
  });

  ttsEngine.onChunkStart = (chunkIndex, text, chapterIndex) => {
    updateActiveChunk(container, chunkIndex);
    updateProgress(container, chunkIndex);
    saveCurrentProgress(container, chapterIndex, chunkIndex, appState);
  };

  ttsEngine.onChunkEnd = () => {};

  ttsEngine.onAllComplete = () => {
    container.querySelector("#btn-play-pause").innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 3"></path></svg>`;
    ttsEngine.isPlaying = false;
    clearSleepTimer();
  };

  ttsEngine.onError = (msg) => { console.error("TTS Error:", msg); };
}

function playPause(container) {
  if (ttsEngine.isPlaying && !ttsEngine.isPaused) {
    ttsEngine.pause();
    container.querySelector("#btn-play-pause").innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  } else {
    const btn = container.querySelector("#btn-play-pause");
    btn.innerHTML = `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z"></path></svg>`;
    ttsEngine.play(ttsEngine.currentChunkIndex);
  }
}

function prevChapter(container, book, chapters, appState) {
  const newIdx = ttsEngine.currentChapterIndex - 1;
  loadChapter(container, book, chapters, newIdx, 0);
  ttsEngine.loadBook(book.bookId, newIdx, chapters[newIdx].chunks, {
    currentChunkIndex: 0, playbackRate: ttsEngine.playbackRate, voice: ttsEngine.currentVoice,
  });
  ttsEngine.play(0);
}

function nextChapter(container, book, chapters, appState) {
  const newIdx = ttsEngine.currentChapterIndex + 1;
  loadChapter(container, book, chapters, newIdx, 0);
  ttsEngine.loadBook(book.bookId, newIdx, chapters[newIdx].chunks, {
    currentChunkIndex: 0, playbackRate: ttsEngine.playbackRate, voice: ttsEngine.currentVoice,
  });
  ttsEngine.play(0);
}

function skipBackward(container) {
  ttsEngine.skipChunks(-2);
  if (ttsEngine.isPlaying) { ttsEngine.play(ttsEngine.currentChunkIndex); }
  else { updateActiveChunk(container, ttsEngine.currentChunkIndex); updateProgress(container, ttsEngine.currentChunkIndex); }
}

function skipForward(container) {
  ttsEngine.skipChunks(2);
  if (ttsEngine.isPlaying) { ttsEngine.play(ttsEngine.currentChunkIndex); }
  else { updateActiveChunk(container, ttsEngine.currentChunkIndex); updateProgress(container, ttsEngine.currentChunkIndex); }
}

function jumpToChunk(container, chunkIndex, chapterIndex, chapters) {
  ttsEngine.currentChunkIndex = chunkIndex;
  updateActiveChunk(container, chunkIndex);
  updateProgress(container, chunkIndex);
  if (ttsEngine.isPlaying) { ttsEngine.play(chunkIndex); }
  saveProgress(chapters[chapterIndex].id, { currentChapterIndex: chapterIndex, currentChunkIndex: chunkIndex });
}

function updateActiveChunk(container, chunkIndex) {
  const karaokeEl = container.querySelector("#karaoke-text");
  karaokeEl.querySelectorAll(".karaoke-chunk").forEach((el, i) => {
    el.classList.toggle("active", i === chunkIndex);
    el.classList.toggle("highlighted", i === chunkIndex);
  });
  scrollToChunk(container, chunkIndex);
  container.querySelector("#chunk-counter").textContent = `${Math.min(chunkIndex + 1, karaokeEl.children.length)} / ${karaokeEl.children.length}`;
}

function updateProgress(container, chunkIndex) {
  const total = container.querySelector("#karaoke-text").children.length;
  const pct = total > 0 ? ((chunkIndex / total) * 100).toFixed(1) : 0;
  container.querySelector("#chapter-progress-fill").style.width = `${pct}%`;
}

function scrollToChunk(container, chunkIndex) {
  const karaokeEl = container.querySelector("#karaoke-text");
  const el = karaokeEl.children[chunkIndex];
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

async function saveCurrentProgress(container, chapterIndex, chunkIndex, appState) {
  const bookId = appState.activeBookId;
  if (!bookId) return;
  const book = await getBook(bookId);
  if (!book) return;
  await saveProgress(bookId, { currentChapterIndex: chapterIndex, currentChunkIndex: chunkIndex });
}

async function populateVoiceSelect(container) {
  const select = container.querySelector("#select-voice");
  const voices = ttsEngine.getVoices();
  select.innerHTML = voices.map((v, i) => `<option value="${v.voiceURI}" ${i === 0 ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join("");
  if (voices.length > 0) { ttsEngine.currentVoice = voices[0]; }
}

async function showChaptersModal(container, appState) {
  const bookId = appState.activeBookId;
  const book = await getBook(bookId);
  const chapters = await getChapters(bookId);
  const modal = document.createElement("div");
  modal.className = "fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4";
  modal.innerHTML = `<div class="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-h-[80vh] w-full max-w-md overflow-y-auto"><h3 class="text-xl font-bold text-white mb-4">Capitoli - ${book.title}</h3><div class="space-y-2" id="chapters-list"></div><div class="mt-6"><button id="modal-close" class="w-full btn-secondary">Chiudi</button></div></div>`;
  const listEl = modal.querySelector("#chapters-list");
  chapters.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.className = "w-full text-left px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors flex justify-between items-center";
    btn.innerHTML = `<span>${ch.title}</span><span class="text-xs text-slate-500">${i + 1}</span>`;
    btn.addEventListener("click", () => {
      loadChapter(container, book, chapters, i, 0);
      ttsEngine.loadBook(book.bookId, i, ch.chunks, { currentChunkIndex: 0, playbackRate: ttsEngine.playbackRate, voice: ttsEngine.currentVoice });
      ttsEngine.play(0);
      modal.remove();
    });
    listEl.appendChild(btn);
  });
  modal.querySelector("#modal-close").addEventListener("click", () => modal.remove());
  document.body.appendChild(modal);
}

function startSleepTimer(container) {
  if (sleepTimer) clearInterval(sleepTimer);
  const start = Date.now();
  const ms = sleepTimerMinutes === -1 ? null : sleepTimerMinutes * 60 * 1000;
  sleepTimer = setInterval(() => {
    if (sleepTimerMinutes === -1) {
      const total = container.querySelector("#karaoke-text").children.length;
      if (ttsEngine.currentChunkIndex >= total - 1 && !ttsEngine.isPlaying) {
        ttsEngine.pause(); clearSleepTimer();
      }
      return;
    }
    if (Date.now() - start >= ms) { ttsEngine.pause(); clearSleepTimer(); }
  }, 1000);
}

function clearSleepTimer() {
  if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
}