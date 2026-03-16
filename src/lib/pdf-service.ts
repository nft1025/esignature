import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

/**
 * Normalizes strings for robust fuzzy matching of names.
 */
function normalizeForMatch(s: string): string {
  // Lowercase, trim, and remove all punctuation for matching
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

/**
 * Checks if a target name (from AI) matches text found in a PDF line.
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const docNorm = normalizeForMatch(docText);
  const targetNorm = normalizeForMatch(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  // Exact match after normalization
  if (docNorm === targetNorm || docNorm.includes(targetNorm)) return true;
  
  // Word-based verification
  const targetWords = targetNorm.split(' ').filter(w => w.length >= 1);
  if (targetWords.length === 0) return false;
  
  // All words in target must be found in doc segment in order
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

  let totalPlacements = 0;

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    // Search pages from end to start (usually signatures are at the end)
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      // Group items into lines based on Y coordinate with tolerance
      const linesMap = new Map<number, any[]>();
      for (const item of content.items as any[]) {
        if (!item.str.trim()) continue; 
        const y = Math.round(item.transform[5]);
        // Use a slightly larger tolerance for messy layouts
        let matchedY = Array.from(linesMap.keys()).find(existingY => Math.abs(existingY - y) < 10);
        if (matchedY !== undefined) {
          linesMap.get(matchedY)!.push(item);
        } else {
          linesMap.set(y, [item]);
        }
      }

      // Sort Y coordinates to iterate lines (bottom to top for signature priority)
      const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

      for (const y of sortedYs) {
        const lineItems = linesMap.get(y)!;
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        // Sliding window to find the name in the line, supports multiple names in one line (columns)
        for (let start = 0; start < lineItems.length; start++) {
          for (let end = start + 1; end <= lineItems.length; end++) {
            const segment = lineItems.slice(start, end);
            const segmentText = segment.map(it => it.str).join(" ");
            
            if (fuzzyNameMatch(segmentText, target)) {
              const firstItem = segment[0];
              const lastItem = segment[segment.length - 1];
              
              // Width calculation needs to account for the width property reported by pdfjs
              const startX = firstItem.transform[4];
              const endX = lastItem.transform[4] + (lastItem.width || 0);
              const totalWidth = endX - startX;
              
              // Detect font size
              const fontSize = Math.max(
                Math.abs(firstItem.transform[0]), 
                Math.abs(firstItem.transform[3]), 
                10
              );

              foundPos = {
                pageIndex: i - 1,
                x: startX,
                y: y,
                textWidth: totalWidth,
                textHeight: fontSize
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
      
      // Scale signature to be slightly wider than the detected text for natural look
      let sigWidth = Math.min(MAX_WIDTH, Math.max(90, foundPos.textWidth * 1.3));
      let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
      
      if (sigHeight > MAX_HEIGHT) {
        sigHeight = MAX_HEIGHT;
        sigWidth = (sigDims.width / sigDims.height) * sigHeight;
      }

      // Horizontally center over the name segment
      let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      
      // Vertical placement: Overlap slightly with the name. 
      // PDF Y is bottom-up. foundPos.y is the text baseline.
      // Move up by a small fraction of text height to sit right on/above it.
      let y = foundPos.y + (foundPos.textHeight * 0.15); 
      
      // Boundary constraints
      x = Math.max(5, Math.min(x, pageWidth - sigWidth - 5));
      y = Math.max(5, Math.min(y, pageHeight - sigHeight - 5));

      page.drawImage(signatureImg, {
        x,
        y,
        width: sigWidth,
        height: sigHeight,
      });
      totalPlacements++;
    }
  }

  // Fallback placement if AI detected names but coordinates couldn't be resolved
  if (totalPlacements === 0 && targetTexts.length > 0) {
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    lastPage.drawImage(signatureImg, {
      x: width - 170,
      y: 80,
      width: 140,
      height: 65,
    });
  }

  return await pdfDoc.save();
}
