
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
  const existingPdfBytes = await file.arrayBuffer();
  
  // 1. Initialize pdfjs to find text coordinates
  const pdfJsDoc = await pdfjsLib.getDocument({ data: existingPdfBytes }).promise;
  let foundPos: { pageIndex: number; x: number; y: number } | null = null;

  if (targetText && targetText.trim() !== "" && targetText !== "Signature") {
    const normalizedTarget = targetText.trim().toLowerCase();
    
    // Scan pages to find the target text coordinates
    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Look for an item that contains our target text or is part of it
      const foundItem = content.items.find((item: any) => {
        const itemStr = (item.str || "").trim().toLowerCase();
        if (itemStr.length < 2) return false;
        return itemStr.includes(normalizedTarget) || normalizedTarget.includes(itemStr);
      }) as any;

      if (foundItem && foundItem.transform) {
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
  const { width } = page.getSize();

  // Signature dimensions
  const sigWidth = 140;
  const sigHeight = 70;
  
  // Default fallback position (bottom center)
  let x = width / 2 - sigWidth / 2;
  let y = 100;

  if (foundPos) {
    // If coordinates were detected, use them.
    // Use the detected X and place the signature slightly above the detected Y.
    x = foundPos.x;
    y = foundPos.y + 12; // Offset to place signature above the name line
  }

  page.drawImage(signatureImg, {
    x,
    y,
    width: sigWidth,
    height: sigHeight,
  });

  return await pdfDoc.save();
}
