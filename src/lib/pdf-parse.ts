// Client-only PDF.js text extraction.
import * as pdfjsLib from "pdfjs-dist";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured || typeof window === "undefined") return;
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorker;
  } catch (e) {
    console.warn("[pdf-parse] failed to set workerSrc", e);
  }
  workerConfigured = true;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function extractPdfText(file: File): Promise<string> {
  ensureWorker();
  console.log("[pdf-parse] start", { name: file.name, size: file.size });
  const buf = await file.arrayBuffer();
  console.log("[pdf-parse] buffer read", buf.byteLength);

  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await withTimeout(loadingTask.promise, 20000, "getDocument");
  console.log("[pdf-parse] pages", pdf.numPages);

  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await withTimeout(pdf.getPage(i), 10000, `getPage:${i}`);
    const content = await withTimeout(page.getTextContent(), 10000, `text:${i}`);
    const strings = content.items
      .map((it: unknown) =>
        typeof it === "object" && it && "str" in it ? (it as { str: string }).str : "",
      )
      .filter(Boolean);
    out += strings.join(" ") + "\n";
  }
  const cleaned = out.replace(/\s+/g, " ").trim();
  console.log("[pdf-parse] done", cleaned.length);
  if (cleaned.length < 80) {
    throw new Error("PDF_NO_TEXT");
  }
  return cleaned;
}
