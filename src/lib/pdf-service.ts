
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

/**
 * Checks if two name strings match, ignoring case, extra whitespace, 
 * and allowing for differences like middle initials or slight variations.
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  const docNorm = normalize(docText);
  const targetNorm = normalize(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  // Direct includes check
  if (docNorm.includes(targetNorm) || targetNorm.includes(docNorm)) return true;
  
  // Word-based check: Ensure all significant words in target are in doc
  const targetWords = targetNorm.split(/\s+/).filter(w => w.length > 2);
  const docWords = docNorm.split(/\s+/);
  
  if (targetWords.length === 0) return false;
  
  return targetWords.every(tw => docWords.some(dw => dw.includes(tw) || tw.includes(dw)));
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

  if (targetTexts.length === 0) {
    targetTexts = ["SIGNATURE_FALLBACK_PLACEHOLDER"];
  }

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    if (target !== "SIGNATURE_FALLBACK_PLACEHOLDER") {
      // Search from last page backwards as signatures are usually at the end
      for (let i = pdfJsDoc.numPages; i >= 1; i--) {
        const page = await pdfJsDoc.getPage(i);
        const content = await page.getTextContent();
        
        const foundItem = content.items.find((item: any) => {
          const itemStr = (item.str || "").trim();
          return itemStr.length > 2 && fuzzyNameMatch(itemStr, target);
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
    const STANDARD_WIDTH = 130; 
    const MAX_SIG_HEIGHT = 60;  
    
    let sigWidth = STANDARD_WIDTH;
    let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
    
    if (sigHeight > MAX_SIG_HEIGHT) {
      sigHeight = MAX_SIG_HEIGHT;
      sigWidth = (sigDims.width / sigDims.height) * sigHeight;
    }

    let x = pageWidth / 2 - sigWidth / 2;
    let y = 100;

    if (foundPos) {
      // Center signature horizontally on detected name area
      x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      
      // Position signature so it overlaps significantly with the name for authenticity (45% overlap)
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
