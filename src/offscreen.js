if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Array.from(this, (byte) => byte.toString(16).padStart(2, "0")).join("");
  };
}
if (!ArrayBuffer.prototype.toHex) {
  ArrayBuffer.prototype.toHex = function () {
    return new Uint8Array(this).toHex();
  };
}

const pdfjsLib = await import("../vendor/pdfjs/pdf.min.mjs");

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "EXTRACT_PDF_TEXT_OFFSCREEN") return false;
  extractPdfText(message.bytes)
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function extractPdfText(bytes) {
  const data = messageDataToUint8Array(bytes);
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  const maxPages = Math.min(pdf.numPages, 20);
  const pages = [];
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push(`Page ${pageNumber}: ${text}`);
  }
  return pages.join("\n\n");
}

function messageDataToUint8Array(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer);
  return new Uint8Array(value || []);
}
