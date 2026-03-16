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
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const docNorm = normalizeForMatch(docText);
  const targetNorm = normalizeForMatch(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  if (docNorm.includes(targetNorm)) return true;
  
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
  const pdfDoc = await PDFDocument.load(pdfLibBytes);
  const signatureImageBytes = await fetch(signatureImage).then((res) => res.arrayBuffer());
  const signatureImg = await pdfDoc.embedPng(signatureImageBytes);
  const pages = pdfDoc.getPages();

  const pdfJsDoc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  let placementsCount = 0;

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    // Search from bottom pages to top for signature areas
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      const linesMap = new Map<number, any[]>();
      for (const item of content.items as any[]) {
        if (!item.str.trim()) continue; 
        const y = Math.round(item.transform[5]);
        let matchedY = Array.from(linesMap.keys()).find(existingY => Math.abs(existingY - y) < 10);
        if (matchedY !== undefined) {
          linesMap.get(matchedY)!.push(item);
        } else {
          linesMap.set(y, [item]);
        }
      }

      // Check lines from bottom to top
      const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

      for (const y of sortedYs) {
        const lineItems = linesMap.get(y)!;
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        // To support side-by-side names, we look for matches within sub-ranges of the line
        // We'll try to find which specific items in the line match our target
        for (let start = 0; start < lineItems.length; start++) {
          for (let end = start + 1; end <= lineItems.length; end++) {
            const segment = lineItems.slice(start, end);
            const segmentText = segment.map(it => it.str).join(" ");
            
            if (fuzzyNameMatch(segmentText, target)) {
              const firstItem = segment[0];
              const lastItem = segment[segment.length - 1];
              const totalWidth = (lastItem.transform[4] + (lastItem.width || 0)) - firstItem.transform[4];
              const textHeight = Math.abs(firstItem.transform[3]) || 12;

              foundPos = {
                pageIndex: i - 1,
                x: firstItem.transform[4],
                y: y,
                textWidth: totalWidth,
                textHeight: textHeight
              };
              break;
            }
          }
          if (foundPos) break;
        }
        if (foundPos) break;
      }
      if (foundPos) break;
    }

    if (foundPos) {
      const page = pages[foundPos.pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();
      
      const sigDims = signatureImg.scale(1.0);
      const MAX_WIDTH = 150; 
      const MAX_HEIGHT = 70;  
      
      let sigWidth = Math.min(MAX_WIDTH, foundPos.textWidth * 1.5);
      let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
      
      if (sigHeight > MAX_HEIGHT) {
        sigHeight = MAX_HEIGHT;
        sigWidth = (sigDims.width / sigDims.height) * sigHeight;
      }

      // Placement logic: Center horizontally over the name.
      // Vertical: PDF Y is baseline. Move up by text height plus a small gap to place ABOVE name.
      let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      let y = foundPos.y + (foundPos.textHeight * 0.5); // Start slightly above the baseline to overlap or sit on the line
      
      x = Math.max(10, Math.min(x, pageWidth - sigWidth - 10));
      y = Math.max(10, Math.min(y, pageHeight - sigHeight - 10));

      page.drawImage(signatureImg, {
        x,
        y,
        width: sigWidth,
        height: sigHeight,
      });
      placementsCount++;
    }
  }

  // Fallback if no specific coordinates found
  if (placementsCount === 0 && targetTexts.length > 0) {
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    lastPage.drawImage(signatureImg, {
      x: width - 180,
      y: 80,
      width: 140,
      height: 60,
    });
  }

  return await pdfDoc.save();
}
