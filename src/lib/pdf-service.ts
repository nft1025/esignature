import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

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
  targetTexts: string[]
): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfLibBytes = new Uint8Array(arrayBuffer.slice(0));
  const pdfJsBytes = new Uint8Array(arrayBuffer.slice(0));
  
  const pdfJsDoc = await pdfjsLib.getDocument({ data: pdfJsBytes }).promise;
  const pdfDoc = await PDFDocument.load(pdfLibBytes);
  const signatureImageBytes = await fetch(signatureImage).then((res) => res.arrayBuffer());
  const signatureImg = await pdfDoc.embedPng(signatureImageBytes);
  const pages = pdfDoc.getPages();

  // If no targets identified, fallback to last page bottom center
  if (targetTexts.length === 0) {
    targetTexts = ["SIGNATURE_FALLBACK_PLACEHOLDER"];
  }

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;
    const normalizedTarget = target.trim().toLowerCase();

    // Search for coordinates for each target name
    if (normalizedTarget !== "signature_fallback_placeholder") {
      for (let i = pdfJsDoc.numPages; i >= 1; i--) {
        const page = await pdfJsDoc.getPage(i);
        const content = await page.getTextContent();
        
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

    const targetPageIndex = foundPos ? foundPos.pageIndex : pages.length - 1;
    const page = pages[targetPageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // STANDARDIZED SIZE LOGIC
    const sigDims = signatureImg.scale(1.0);
    const STANDARD_WIDTH = 130; // Points
    const MAX_SIG_HEIGHT = 60;  // Points
    
    let sigWidth = STANDARD_WIDTH;
    let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
    
    // Ensure height is not too big for the standard width
    if (sigHeight > MAX_SIG_HEIGHT) {
      sigHeight = MAX_SIG_HEIGHT;
      sigWidth = (sigDims.width / sigDims.height) * sigHeight;
    }

    let x = pageWidth / 2 - sigWidth / 2;
    let y = 100;

    if (foundPos) {
      // Center signature horizontally on detected name
      x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      
      // Position signature so it overlaps significantly with the name for authenticity
      // Placing it above the baseline but extending down into the text area
      y = foundPos.y - (sigHeight * 0.45); 
      
      // Keep within page bounds
      x = Math.max(15, Math.min(x, pageWidth - sigWidth - 15));
      y = Math.max(15, Math.min(y, pageHeight - sigHeight - 15));
    }

    page.drawImage(signatureImg, {
      x,
      y,
      width: sigWidth,
      height: sigHeight,
    });
  }

  return await pdfDoc.save();
}
