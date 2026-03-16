import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

/**
 * Normalizes strings for robust fuzzy matching of names.
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

/**
 * Checks if a target name (from AI) matches text found in a PDF line.
 * Handles middle initials and varying word counts.
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const docNorm = normalizeForMatch(docText);
  const targetNorm = normalizeForMatch(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  // Direct inclusion check
  if (docNorm.includes(targetNorm)) return true;
  
  // Word-by-word check to handle initials (e.g., "Neil F. Teresa" matching "Neil Teresa")
  const targetWords = targetNorm.split(' ').filter(w => w.length >= 2);
  if (targetWords.length === 0) return false;
  
  return targetWords.every(tw => docNorm.includes(tw));
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
    return await pdfDoc.save();
  }

  let placementsCount = 0;

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    // Search from the last page to the first (bottom-up search)
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Group items into logical lines using a 12pt Y-coordinate threshold
      const linesMap = new Map<number, any[]>();
      for (const item of content.items as any[]) {
        if (!item.str.trim()) continue; // Skip empty fragments
        
        const y = Math.round(item.transform[5]);
        let matchedY = Array.from(linesMap.keys()).find(existingY => Math.abs(existingY - y) < 12);
        
        if (matchedY !== undefined) {
          linesMap.get(matchedY)!.push(item);
        } else {
          linesMap.set(y, [item]);
        }
      }

      // Sort Y coordinates to check the "bottom-most" lines first (conventional for signatures)
      const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

      for (const y of sortedYs) {
        const lineItems = linesMap.get(y)!;
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = lineItems.map(it => it.str).join(" ");

        if (fuzzyNameMatch(lineText, target)) {
          const firstItem = lineItems[0];
          const lastItem = lineItems[lineItems.length - 1];
          const totalWidth = (lastItem.transform[4] + (lastItem.width || 40)) - firstItem.transform[4];
          
          foundPos = {
            pageIndex: i - 1,
            x: firstItem.transform[4],
            y: y,
            textWidth: totalWidth,
            textHeight: Math.abs(firstItem.transform[3]) || 12 
          };
          break;
        }
      }
      if (foundPos) break;
    }

    if (foundPos) {
      const page = pages[foundPos.pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      
      const sigDims = signatureImg.scale(1.0);
      const STANDARD_WIDTH = 140; 
      const MAX_SIG_HEIGHT = 70;  
      
      let sigWidth = STANDARD_WIDTH;
      let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
      
      if (sigHeight > MAX_SIG_HEIGHT) {
        sigHeight = MAX_SIG_HEIGHT;
        sigWidth = (sigDims.width / sigDims.height) * sigHeight;
      }

      // Center the signature horizontally over the name and overlap vertically
      let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      let y = foundPos.y - (sigHeight * 0.35); // Overlap slightly with the name line
      
      // Ensure it stays within page boundaries
      x = Math.max(15, Math.min(x, pageWidth - sigWidth - 15));
      y = Math.max(15, Math.min(y, pageHeight - sigHeight - 15));

      page.drawImage(signatureImg, {
        x,
        y,
        width: sigWidth,
        height: sigHeight,
      });
      placementsCount++;
    }
  }

  // Final Fallback: If AI detected a name but coordinates failed, stamp at standard bottom location
  if (placementsCount === 0 && targetTexts.length > 0) {
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    lastPage.drawImage(signatureImg, {
      x: width - 180,
      y: 100,
      width: 140,
      height: 60,
    });
  }

  return await pdfDoc.save();
}
