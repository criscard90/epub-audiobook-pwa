import { initLibraryView } from "./ui/libraryView.js";
import { initPlayerView } from "./ui/playerView.js";
import { openDB } from "./db/storage.js";

// App state
export const state = {
  currentView: "library", // 'library' | 'player'
  activeBookId: null,
  books: [],
};

// DOM elements
const app = document.getElementById("app");

// Navigation
export function navigateTo(view, bookId = null) {
  state.currentView = view;
  state.activeBookId = bookId;
  render();
}

export function getState() {
  return state;
}

async function init() {
  // Initialize IndexedDB
  await openDB();

  // Handle file_open from PWA file_handler
  if ("launchQueue" in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
      for (const fileHandle of launchParams.files) {
        const file = await fileHandle.getFile();
        await importBookFile(file);
      }
      navigateTo("library");
    });
  }

  // Handle <input type="file"> change
  const fileInput = document.getElementById("epub-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (file) {
        await importBookFile(file);
        navigateTo("library");
      }
    });
  }

  render();
}

async function importBookFile(file) {
  try {
    const { parseEPUB } = await import("./epub/epubParser.js");
    const { saveBook } = await import("./db/storage.js");

    const bookData = await parseEPUB(file);
    await saveBook(bookData);
    state.books = await getAllBooks();
    render();
  } catch (err) {
    console.error("Errore nell'importazione EPUB:", err);
    alert("Errore durante l'importazione del file EPUB. Assicurati che sia un file EPUB valido.");
  }
}

async function getAllBooks() {
  const { getAllBooks: fetchBooks } = await import("./db/storage.js");
  return fetchBooks();
}

function render() {
  app.innerHTML = "";

  if (state.currentView === "library") {
    initLibraryView(app, state, navigateTo);
  } else if (state.currentView === "player" && state.activeBookId) {
    initPlayerView(app, state, navigateTo);
  } else {
    navigateTo("library");
  }
}

// Expose globally for inline handlers if needed
window.epubAudiobook = { navigateTo, getState, init };

init();