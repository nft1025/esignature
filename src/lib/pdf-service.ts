import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// Set up worker using unpkg for version parity
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
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
  const arrayBuffer = await file.arrayBuffer();
  
  // Create fresh copies of buffers to avoid library interference
  const pdfJsBytes = new Uint8Array(arrayBuffer.slice(0));
  const pdfLibBytes = new Uint8Array(arrayBuffer.slice(0));
  
  // 1. Initialize pdfjs to find text coordinates
  const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfJsBytes }).promise;
  let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

  if (targetText && targetText.trim() !== "" && targetText !== "Signature") {
    const normalizedTarget = targetText.trim().toLowerCase();
    
    for (let i = 1; i <= pdfJsDoc.numPages; i++) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      const foundItem = content.items.find((item: any) => {
        const itemStr = (item.str || "").trim().toLowerCase();
        return itemStr.includes(normalizedTarget) || normalizedTarget.includes(itemStr);
      }) as any;

      if (foundItem && foundItem.transform) {
        foundPos = {
          pageIndex: i - 1,
          x: foundItem.transform[4],
          y: foundItem.transform[5],
          textWidth: foundItem.width || 100,
          textHeight: Math.abs(foundItem.transform[3]) || 12 // Estimate height from vertical scale
        };
        break;
      }
    }
  }

  // 2. Initialize pdf-lib to perform the actual signing
  const pdfDoc = await PDFDocument.load(pdfLibBytes);
  const signatureImageBytes = await fetch(signatureImage).then((res) => res.arrayBuffer());
  const signatureImg = await pdfDoc.embedPng(signatureImageBytes);

  const pages = pdfDoc.getPages();
  const targetPageIndex = foundPos ? foundPos.pageIndex : pages.length - 1;
  const page = pages[targetPageIndex];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  // Signature dimensions - Fit to text width
  const sigDims = signatureImg.scale(1.0);
  let sigWidth = foundPos ? foundPos.textWidth * 1.1 : 140; // 10% wider than text for flair
  let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
  
  // Cap dimensions to prevent overflow on very small/large text
  const MAX_SIG_HEIGHT = 80;
  if (sigHeight > MAX_SIG_HEIGHT) {
    sigHeight = MAX_SIG_HEIGHT;
    sigWidth = (sigDims.width / sigDims.height) * sigHeight;
  }

  // Default fallback position
  let x = pageWidth / 2 - sigWidth / 2;
  let y = 100;

  if (foundPos) {
    // Center signature over the found text horizontally
    x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
    
    // Position strictly ABOVE the text
    // foundPos.y is the baseline, we add textHeight to clear the characters
    y = foundPos.y + foundPos.textHeight + 2; 

    // Safety bounds checking
    x = Math.max(10, Math.min(x, pageWidth - sigWidth - 10));
    y = Math.max(10, Math.min(y, pageHeight - sigHeight - 10));
  }

  page.drawImage(signatureImg, {
    x,
    y,
    width: sigWidth,
    height: sigHeight,
  });

  return await pdfDoc.save();
}
