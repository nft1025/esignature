import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

/**
 * Checks if two name strings match, ignoring case, extra whitespace, 
 * and allowing for differences like middle initials.
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  const docNorm = normalize(docText);
  const targetNorm = normalize(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  // Direct match or inclusion
  if (docNorm === targetNorm || docNorm.includes(targetNorm) || targetNorm.includes(docNorm)) return true;
  
  const targetWords = targetNorm.split(/\s+/).filter(w => w.length >= 2);
  const docWords = docNorm.split(/\s+/);
  
  if (targetWords.length === 0) return false;
  
  // Ensure all major target words exist in the document string
  return targetWords.every(tw => docWords.some(dw => dw.includes(tw) || tw.includes(dw)));
}

export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
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
  // Create separate buffers for PDF.js and pdf-lib
  const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const pdfDoc = await PDFDocument.load(new Uint8Array(arrayBuffer.slice(0)));
  
  const signatureImageBytes = await fetch(signatureImage).then((res) => res.arrayBuffer());
  const signatureImg = await pdfDoc.embedPng(signatureImageBytes);
  const pages = pdfDoc.getPages();

  // If no targets found, return original
  if (targetTexts.length === 0) {
    return await pdfDoc.save();
  }

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    // SEARCH BOTTOM-UP: Start from the last page to find official signature blocks
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Look for the signatory name item
      const item = content.items.find((item: any) => {
        const itemStr = (item.str || "").trim();
        return itemStr.length > 2 && fuzzyNameMatch(itemStr, target);
      }) as any;

      if (item && item.transform) {
        foundPos = {
          pageIndex: i - 1,
          x: item.transform[4],
          y: item.transform[5],
          textWidth: item.width || 100,
          textHeight: Math.abs(item.transform[3]) || 12 
        };
        break;
      }
    }

    if (!foundPos) continue;

    const page = pages[foundPos.pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    
    // STANDARD SIZE LOGIC
    const sigDims = signatureImg.scale(1.0);
    const STANDARD_WIDTH = 130; 
    const MAX_SIG_HEIGHT = 60;  
    
    let sigWidth = STANDARD_WIDTH;
    let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
    
    if (sigHeight > MAX_SIG_HEIGHT) {
      sigHeight = MAX_SIG_HEIGHT;
      sigWidth = (sigDims.width / sigDims.height) * sigHeight;
    }

    // Centering and Overlap: 45% overlap with name for natural appearance
    let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
    let y = foundPos.y - (sigHeight * 0.45); 
    
    // Bounds check to keep signature on paper
    x = Math.max(20, Math.min(x, pageWidth - sigWidth - 20));
    y = Math.max(20, Math.min(y, pageHeight - sigHeight - 20));

    page.drawImage(signatureImg, {
      x,
      y,
      width: sigWidth,
      height: sigHeight,
    });
  }

  return await pdfDoc.save();
}
