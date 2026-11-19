import { openDB as idbOpenDB, deleteDB } from "idb";

const DB_NAME = "epub-audiobook-db";
const DB_VERSION = 1;

let dbInstance = null;

export async function openDB() {
  if (dbInstance) return dbInstance;

  dbInstance = await idbOpenDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Books store
      if (!db.objectStoreNames.contains("books")) {
        const bookStore = db.createObjectStore("books", { keyPath: "bookId" });
        bookStore.createIndex("addedAt", "addedAt", { unique: false });
      }

      // Chapters store
      if (!db.objectStoreNames.contains("chapters")) {
        const chapterStore = db.createObjectStore("chapters", { keyPath: "id" });
        chapterStore.createIndex("bookId", "bookId", { unique: false });
        chapterStore.createIndex("chapterIndex", "chapterIndex", { unique: false });
      }

      // Progress store
      if (!db.objectStoreNames.contains("progress")) {
        const progressStore = db.createObjectStore("progress", { keyPath: "bookId" });
      }
    },
  });

  return dbInstance;
}

export async function saveBook(book) {
  const db = await openDB();
  const tx = db.transaction("books", "readwrite");
  await tx.store.put({
    bookId: book.bookId,
    title: book.title,
    author: book.author,
    language: book.language,
    coverBlob: book.coverBlob || null,
    coverUrl: book.coverUrl || null,
    chaptersCount: book.chaptersCount,
    addedAt: book.addedAt || Date.now(),
  });
  await tx.done;

  // Save chapters
  if (book.chapters && book.chapters.length) {
    const chapterTx = db.transaction("chapters", "readwrite");
    for (let i = 0; i < book.chapters.length; i++) {
      const ch = book.chapters[i];
      await chapterTx.store.put({
        id: `${book.bookId}_${i}`,
        bookId: book.bookId,
        chapterIndex: i,
        title: ch.title,
        chunks: ch.chunks,
      });
    }
    await chapterTx.done;
  }

  // Initialize progress
  const progressTx = db.transaction("progress", "readwrite");
  await progressTx.store.put({
    bookId: book.bookId,
    currentChapterIndex: 0,
    currentChunkIndex: 0,
    playbackRate: 1.0,
    voiceURI: null,
    updatedAt: Date.now(),
  });
  await progressTx.done;

  return book.bookId;
}

export async function getAllBooks() {
  const db = await openDB();
  return db.getAll("books");
}

export async function getBook(bookId) {
  const db = await openDB();
  return db.get("books", bookId);
}

export async function getChapters(bookId) {
  const db = await openDB();
  const tx = db.transaction("chapters", "readonly");
  const all = await tx.store.getAll();
  return all.filter((c) => c.bookId === bookId).sort((a, b) => a.chapterIndex - b.chapterIndex);
}

export async function getChapter(bookId, chapterIndex) {
  const db = await openDB();
  return db.get("chapters", `${bookId}_${chapterIndex}`);
}

export async function deleteBook(bookId) {
  const db = await openDB();

  // Delete chapters
  const chapterTx = db.transaction("chapters", "readwrite");
  const allChapters = await chapterTx.store.getAll();
  for (const ch of allChapters) {
    if (ch.bookId === bookId) {
      await chapterTx.store.delete(ch.id);
    }
  }
  await chapterTx.done;

  // Delete progress
  const progressTx = db.transaction("progress", "readwrite");
  await progressTx.store.delete(bookId);
  await progressTx.done;

  // Delete book
  const bookTx = db.transaction("books", "readwrite");
  await bookTx.store.delete(bookId);
  await bookTx.done;
}

export async function saveProgress(bookId, progress) {
  const db = await openDB();
  const tx = db.transaction("progress", "readwrite");
  await tx.store.put({
    bookId,
    currentChapterIndex: progress.currentChapterIndex,
    currentChunkIndex: progress.currentChunkIndex,
    playbackRate: progress.playbackRate,
    voiceURI: progress.voiceURI,
    updatedAt: Date.now(),
  });
  await tx.done;
}

export async function getProgress(bookId) {
  const db = await openDB();
  return db.get("progress", bookId);
}

export async function deleteAllBooks() {
  const db = await openDB();
  await db.clear("books");
  await db.clear("chapters");
  await db.clear("progress");
}