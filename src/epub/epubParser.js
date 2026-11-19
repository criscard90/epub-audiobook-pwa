import EPUB_NS from "http://www.idpf.org/2007/opf";
const DC_NS = "http://purl.org/dc/elements/1.1/";

export async function parseEPUB(file) {
  const JSZip = await import("jszip");
  const zip = new JSZip();
  const blob = await file.arrayBuffer();
  await zip.loadAsync(blob);

  const containerXml = await zip.file("META-INF/container.xml")?.async("text");
  if (!containerXml) {
    throw new Error("META-INF/container.xml non trovato nell'EPUB");
  }

  const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const rootfileEls = containerDoc.getElementsByTagName("rootfile");
  if (rootfileEls.length === 0) {
    throw new Error("Nessun rootfile trovato in container.xml");
  }
  const opfPath = rootfileEls[0].getAttribute("full-path");
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf("/"));

  const opfXml = await zip.file(opfPath)?.async("text");
  if (!opfXml) {
    throw new Error(`File OPF non trovato: ${opfPath}`);
  }

  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");
  const metadata = extractMetadata(opfDoc);
  const manifest = extractManifest(opfDoc, opfDir);
  const spine = extractSpine(opfDoc);
  const tocItems = await extractTOC(zip, opfDoc, opfDir);

  const spineWithTitles = spine.map((item, index) => {
    const manifestItem = manifest[item.idref];
    const href = manifestItem ? manifestItem.href : null;
    const tocEntry = tocItems.find((t) => t.href === href || t.idref === item.idref);
    return {
      id: item.idref,
      index,
      title: tocEntry ? tocEntry.title : `Capitolo ${index + 1}`,
      href,
      fullPath: href ? `${opfDir}/${href}`.replace(/\/+/g, "/") : null,
    };
  });

  const chapters = [];
  for (const item of spineWithTitles) {
    if (!item.fullPath || !zip.file(item.fullPath)) {
      chapters.push({ id: item.id, title: item.title, chunks: [] });
      continue;
    }
    const chapterXml = await zip.file(item.fullPath).async("text");
    const textContent = cleanAndChunkText(chapterXml);
    chapters.push({ id: item.id, title: item.title, chunks: textContent });
  }

  const bookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return {
    bookId,
    title: metadata.title || "Titolo sconosciuto",
    author: metadata.author || "Autore sconosciuto",
    language: metadata.language || "it",
    coverBlob: metadata.coverBlob || null,
    coverUrl: metadata.coverUrl || null,
    chaptersCount: chapters.length,
    chapters,
    addedAt: Date.now(),
  };
}

function extractMetadata(opfDoc) {
  const metadata = {};
  const titleEl = opfDoc.getElementsByTagName("dc:title")[0] || opfDoc.getElementsByTagName("title")[0];
  metadata.title = titleEl?.textContent?.trim() || "";
  const creatorEl = opfDoc.getElementsByTagName("dc:creator")[0];
  metadata.author = creatorEl?.textContent?.trim() || "";
  const languageEl = opfDoc.getElementsByTagName("dc:language")[0];
  metadata.language = languageEl?.textContent?.trim() || "it";

  const manifestItems = opfDoc.getElementsByTagName("manifest")[0]?.getElementsByTagName("item");
  let coverHref = null;
  let coverId = null;

  if (manifestItems) {
    for (let i = 0; i < manifestItems.length; i++) {
      const item = manifestItems[i];
      const props = item.getAttribute("properties") || "";
      if (props.includes("cover-image")) {
        coverHref = item.getAttribute("href");
        coverId = item.getAttribute("id");
        break;
      }
    }
  }

  if (!coverHref) {
    const metaEls = opfDoc.getElementsByTagName("meta");
    for (let i = 0; i < metaEls.length; i++) {
      if (metaEls[i].getAttribute("name") === "cover") {
        coverId = metaEls[i].getAttribute("content");
        break;
      }
    }
    if (coverId && manifestItems) {
      for (let i = 0; i < manifestItems.length; i++) {
        if (manifestItems[i].getAttribute("id") === coverId) {
          coverHref = manifestItems[i].getAttribute("href");
          break;
        }
      }
    }
  }

  metadata.coverHref = coverHref;
  metadata.coverId = coverId;
  return metadata;
}

function extractManifest(opfDoc, opfDir) {
  const manifest = {};
  const manifestEl = opfDoc.getElementsByTagName("manifest")[0];
  if (!manifestEl) return manifest;
  const items = manifestEl.getElementsByTagName("item");
  for (let i = 0; i < items.length; i++) {
    const id = items[i].getAttribute("id");
    const href = items[i].getAttribute("href");
    const mediaType = items[i].getAttribute("media-type");
    const fullPath = href ? `${opfDir}/${href}`.replace(//+/g, "/") : null;
    manifest[id] = { href, mediaType, fullPath };
  }
  return manifest;
}

function extractSpine(opfDoc) {
  const spine = [];
  const spineEl = opfDoc.getElementsByTagName("spine")[0];
  if (!spineEl) return spine;
  const itemrefs = spineEl.getElementsByTagName("itemref");
  for (let i = 0; i < itemrefs.length; i++) {
    spine.push({ idref: itemrefs[i].getAttribute("idref") });
  }
  return spine;
}

async function extractTOC(zip, opfDoc, opfDir) {
  const manifestEl = opfDoc.getElementsByTagName("manifest")[0];
  const items = manifestEl ? manifestEl.getElementsByTagName("item") : [];
  let navItem = null;
  for (let i = 0; i < items.length; i++) {
    const props = items[i].getAttribute("properties") || "";
    if (props.includes("nav")) {
      navItem = items[i];
      break;
    }
  }

  if (navItem) {
    const navHref = navItem.getAttribute("href");
    const navFullPath = `${opfDir}/${navHref}`.replace(//+/g, "/");
    const navFile = zip.file(navFullPath);
    if (navFile) {
      const navXml = await navFile.async("text");
      return parseNavXHTML(navXml);
    }
  }

  for (let i = 0; i < items.length; i++) {
    const mediaType = items[i].getAttribute("media-type") || "";
    if (mediaType.includes("dtbncx")) {
      const ncxHref = items[i].getAttribute("href");
      const ncxFullPath = `${opfDir}/${ncxHref}`.replace(//+/g, "/");
      const ncxFile = zip.file(ncxFullPath);
      if (ncxFile) {
        const ncxXml = await ncxFile.async("text");
        return parseNCX(ncxXml);
      }
    }
  }
  return [];
}

function parseNavXHTML(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xhtml+xml");
  const toc = [];
  const navEls = doc.getElementsByTagName("nav");
  let targetNav = null;
  for (let i = 0; i < navEls.length; i++) {
    if (navEls[i].getAttribute("epub:type") === "toc" || !targetNav) {
      targetNav = navEls[i];
    }
  }
  if (!targetNav) return toc;
  const listItems = targetNav.getElementsByTagName("li");
  for (let i = 0; i < listItems.length; i++) {
    const li = listItems[i];
    const a = li.getElementsByTagName("a")[0];
    if (a) {
      toc.push({ title: a.textContent.trim(), href: a.getAttribute("href") });
    }
  }
  return toc;
}

function parseNCX(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const toc = [];
  const navPoints = doc.getElementsByTagName("navPoint");
  for (let i = 0; i < navPoints.length; i++) {
    const navPoint = navPoints[i];
    const navLabel = navPoint.getElementsByTagName("navLabel")[0];
    const content = navPoint.getElementsByTagName("content")[0];
    if (navLabel && content) {
      toc.push({ title: navLabel.textContent.trim(), href: content.getAttribute("src") });
    }
  }
  return toc;
}

function cleanAndChunkText(htmlContent) {
  const doc = new DOMParser().parseFromString(htmlContent, "text/html");
  const removeSelectors = ["script", "style", ".footnote", ".pagebreak", ".epub-pagebreak", "nav", ".toc", ".index"];
  removeSelectors.forEach((sel) => {
    const els = doc.querySelectorAll(sel);
    els.forEach((el) => el.remove());
  });
  const pagebreakEls = doc.querySelectorAll('[epub:type~="pagebreak"], [epub:type~="footnote"]');
  pagebreakEls.forEach((el) => el.remove());

  const body = doc.body || doc.documentElement;
  let text = body.textContent || body.innerText || "";
  text = text.replace(/\s+/g, " ").trim();

  if (!text) return [];

  const chunkMaxLen = 240;
  const chunks = [];
  const sentences = splitByStrongPunctuation(text);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const sentence of sentences) {
    const candidate = currentChunk ? currentChunk + " " + sentence : sentence;

    if (candidate.length <= chunkMaxLen) {
      currentChunk = candidate;
    } else {
      if (sentence.length > chunkMaxLen) {
        if (currentChunk) {
          chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
          currentChunk = "";
        }
        const words = sentence.split(" ");
        let temp = "";
        for (const word of words) {
          const t = temp ? temp + " " + word : word;
          if (t.length <= chunkMaxLen) {
            temp = t;
          } else {
            if (temp) {
              chunks.push({ index: chunkIndex++, text: temp.trim() });
            }
            temp = word;
          }
        }
        if (temp) {
          currentChunk = temp;
        }
      } else {
        if (currentChunk) {
          chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
        }
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk) {
    chunks.push({ index: chunkIndex++, text: currentChunk.trim() });
  }

  return chunks;
}

function splitByStrongPunctuation(text) {
  const parts = [];
  let current = "";
  const punctRegex = /([.!?;:…])/;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    current += char;
    if (punctRegex.test(char)) {
      const next = text[i + 1];
      if (next === " " || next === undefined || next === "\n") {
        parts.push(current.trim());
        current = "";
        if (next === " ") i++;
      }
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}