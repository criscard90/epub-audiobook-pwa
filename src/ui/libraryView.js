/**
 * Library View - Schermata libreria con lista libri importati
 */

import { getChapters, deleteBook } from "../db/storage.js";

export function initLibraryView(container, appState, navigateTo) {
  container.innerHTML = `
    <div class="library-view min-h-screen p-4 sm:p-6 lg:p-8">
      <div class="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold text-white tracking-tight">📚 Libreria</h1>
          <p class="text-slate-400 mt-1">I tuoi audiolibri EPUB, sempre disponibili offline</p>
        </div>
        <div class="flex gap-3">
          <button id="btn-upload" class="btn-primary flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Carica EPUB
          </button>
          <input type="file" id="epub-file-input" accept=".epub,application/epub+zip" class="hidden" />
          <button id="btn-theme" class="btn-secondary theme-toggle p-3 rounded-lg" title="Cambia tema">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
          </button>
        </div>
      </div>

      <div class="mb-6 bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-sm text-slate-300">Suggerimento: puoi anche aprire un file .epub direttamente dal file manager con "Apri con EPUB Audiobook"</span>
      </div>

      <div id="library-list" class="space-y-3"></div>

      <div id="library-empty" class="hidden text-center py-16">
        <div class="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </div>
        <h2 class="text-xl font-semibold text-white">Nessun libro importato</h2>
        <p class="text-slate-400 mt-2">Carica un file EPUB per iniziare ad ascoltare i tuoi audiolibri.</p>
      </div>
    </div>
  `;

  const uploadBtn = container.querySelector("#btn-upload");
  const fileInput = container.querySelector("#epub-file-input");
  const themeBtn = container.querySelector("#btn-theme");

  uploadBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await importBookFile(file, appState, navigateTo);
  });

  themeBtn.addEventListener("click", () => {
    const html = document.documentElement;
    const isDark = html.getAttribute("data-theme") === "dark";
    html.setAttribute("data-theme", isDark ? "light" : "dark");
  });

  renderLibrary(container, appState, navigateTo);
}

async function importBookFile(file, appState, navigateTo) {
  try {
    const { parseEPUB } = await import("../epub/epubParser.js");
    const { saveBook, getAllBooks } = await import("../db/storage.js");
    const bookData = await parseEPUB(file);
    await saveBook(bookData);
    appState.books = await getAllBooks();
    navigateTo("player", bookData.bookId);
  } catch (err) {
    console.error("Errore nell'importazione EPUB:", err);
    alert("Errore durante l'importazione del file EPUB.");
  }
}

export async function renderLibrary(container, appState, navigateTo) {
  const listEl = container.querySelector("#library-list");
  const emptyEl = container.querySelector("#library-empty");

  if (!appState.books || appState.books.length === 0) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("hidden");
    return;
  }

  emptyEl.classList.add("hidden");
  listEl.innerHTML = appState.books
    .map(
      (book) => `
      <div class="card-book flex flex-col sm:flex-row gap-4 items-start sm:items-center" data-book-id="${book.bookId}">
        <div class="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden border border-slate-700 bg-slate-800">
          ${book.coverUrl
            ? `<img src="${book.coverUrl}" alt="Copertina" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center bg-slate-800">
                <svg class="w-12 h-12 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              </div>`}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-lg font-semibold text-white truncate">${book.title}</h3>
          <p class="text-slate-400 text-sm mt-0.5">${book.author}</p>
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
            <span class="text-xs text-slate-400 ml-2">${book.chaptersCount} capitoli</span>
          </div>
        </div>
        <div class="flex items-center gap-2 ml-2 sm:ml-0">
          <button class="btn-play-book p-3 rounded-lg bg-accent-500 text-dark-900 hover:bg-accent-400 transition-colors" title="Riproduci">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          </button>
          <button class="btn-delete-book p-3 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white transition-colors border border-red-500/30" title="Elimina">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </div>
      </div>
    `
    )
    .join("");

  listEl.querySelectorAll("[data-book-id]").forEach((el) => {
    const bookId = el.getAttribute("data-book-id");
    el.querySelector(".btn-play-book").addEventListener("click", (e) => {
      e.stopPropagation();
      navigateTo("player", bookId);
    });
    el.querySelector(".btn-delete-book").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("Eliminare questo libro dalla libreria?")) {
        await deleteBook(bookId);
        const { getAllBooks } = await import("../db/storage.js");
        appState.books = await getAllBooks();
        renderLibrary(container, appState, navigateTo);
        if (appState.activeBookId === bookId) {
          navigateTo("library");
        }
      }
    });
    el.addEventListener("click", () => {
      navigateTo("player", bookId);
    });
  });
}