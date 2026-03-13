
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Set up worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  // For pdfjs-dist 4.x+, the worker is an ES module (.mjs)
  // Using unpkg ensures we get the exact version matching our installed package
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(' ') + '\n';
  }

  return fullText;
}

export async function signPdf(
  file: File,
  signatureImage: string,
  targetText: string
): Promise<Uint8Array> {
  // Use Uint8Array for the PDF bytes to ensure compatibility with both pdfjs and pdf-lib
  const arrayBuffer = await file.arrayBuffer();
  const existingPdfBytes = new Uint8Array(arrayBuffer);
  
  // 1. Initialize pdfjs to find text coordinates
  // Pass a slice (copy) to pdfjs to prevent potential buffer interference
  const pdfJsDoc = await pdfjsLib.getDocument({ data: existingPdfBytes.slice(0) }).promise;
  let foundPos: { pageIndex: number; x: number; y: number } | null = null;

  if (targetText && targetText.trim() !== "" && targetText !== "Signature") {
    const normalizedTarget = targetText.trim().toLowerCase();
    
    // Scan pages to find the target text coordinates
    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Look for an item that contains our target text
      const foundItem = content.items.find((item: any) => {
        const itemStr = (item.str || "").trim().toLowerCase();
        if (itemStr.length < 2) return false;
        return itemStr.includes(normalizedTarget) || normalizedTarget.includes(itemStr);
      }) as any;

      if (foundItem && foundItem.transform) {
        // transform[4] is X, transform[5] is Y in PDF coordinate space (bottom-left origin)
        foundPos = {
          pageIndex: i - 1,
          x: foundItem.transform[4],
          y: foundItem.transform[5]
        };
        break;
      }
    }
  }

  // 2. Initialize pdf-lib to perform the actual signing
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const signatureImageBytes = await fetch(signatureImage).then((res) => res.arrayBuffer());
  const signatureImg = await pdfDoc.embedPng(signatureImageBytes);

  const pages = pdfDoc.getPages();
  const targetPageIndex = foundPos ? foundPos.pageIndex : pages.length - 1;
  const page = pages[targetPageIndex];
  const { width, height } = page.getSize();

  // Signature dimensions
  const sigWidth = 140;
  const sigHeight = 70;
  
  // Default fallback position (bottom center)
  let x = width / 2 - sigWidth / 2;
  let y = 100;

  if (foundPos) {
    // detected X is the start of the text; detected Y is the baseline.
    // We place the signature slightly above the baseline.
    x = foundPos.x;
    y = foundPos.y + 10; 

    // Safety bounds checking to keep the signature on the page
    x = Math.max(10, Math.min(x, width - sigWidth - 10));
    y = Math.max(10, Math.min(y, height - sigHeight - 10));
  }

  page.drawImage(signatureImg, {
    x,
    y,
    width: sigWidth,
    height: sigHeight,
  });

  return await pdfDoc.save();
}
