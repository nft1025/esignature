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
  
  // Create fresh copies of buffers
  const pdfJsBytes = new Uint8Array(arrayBuffer.slice(0));
  const pdfLibBytes = new Uint8Array(arrayBuffer.slice(0));
  
  // 1. Initialize pdfjs to find text coordinates
  const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfJsBytes }).promise;
  let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

  // We search backwards from the end of the document as signature blocks are usually at the end
  if (targetText && targetText.trim() !== "" && targetText !== "Signature") {
    const normalizedTarget = targetText.trim().toLowerCase();
    
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Look for the item that most closely matches the name
      const foundItem = content.items.find((item: any) => {
        const itemStr = (item.str || "").trim().toLowerCase();
        return itemStr.length > 2 && (itemStr.includes(normalizedTarget) || normalizedTarget.includes(itemStr));
      }) as any;

      if (foundItem && foundItem.transform) {
        foundPos = {
          pageIndex: i - 1,
          x: foundItem.transform[4],
          y: foundItem.transform[5],
          textWidth: foundItem.width || 100,
          textHeight: Math.abs(foundItem.transform[3]) || 12 
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

  // Signature dimensions
  const sigDims = signatureImg.scale(1.0);
  
  // Fit signature to the width of the detected text
  let sigWidth = foundPos ? foundPos.textWidth * 1.2 : 150; // Slightly wider for style
  let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
  
  // Cap dimensions for visual sanity
  const MAX_SIG_HEIGHT = 80;
  if (sigHeight > MAX_SIG_HEIGHT) {
    sigHeight = MAX_SIG_HEIGHT;
    sigWidth = (sigDims.width / sigDims.height) * sigHeight;
  }

  // Positioning
  let x = pageWidth / 2 - sigWidth / 2;
  let y = 100;

  if (foundPos) {
    // Center over the text
    x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
    // Lowered Y coordinate to overlap with the text
    // foundPos.y is the baseline. Moving it slightly lower than the baseline
    // so the signature overlaps the name as requested.
    y = foundPos.y - (sigHeight * 0.3); 

    // Final safety bounds
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
