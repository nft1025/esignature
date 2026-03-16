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
 * Checks if a target name (from AI) matches text found in a PDF segment.
 * Uses whole-word matching to avoid partial overlaps.
 */
function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const docNorm = normalizeForMatch(docText);
  const targetNorm = normalizeForMatch(targetName);
  
  if (!docNorm || !targetNorm) return false;
  
  // Exact match after normalization
  if (docNorm === targetNorm) return true;
  
  // Word-based verification: All words in target must be found as whole words in doc segment
  const targetWords = targetNorm.split(' ').filter(w => w.length >= 1);
  if (targetWords.length === 0) return false;
  
  return targetWords.every(tw => {
    // Escape word for regex and check for word boundaries
    const escaped = tw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(docNorm);
  });
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
        // Use tolerance for messy layouts (standard line height usually 10-14pt)
        let matchedY = Array.from(linesMap.keys()).find(existingY => Math.abs(existingY - y) < 10);
        if (matchedY !== undefined) {
          linesMap.get(matchedY)!.push(item);
        } else {
          linesMap.set(y, [item]);
        }
      }

      // Sort Y coordinates to iterate lines
      const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

      for (const y of sortedYs) {
        const lineItems = linesMap.get(y)!;
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

        // Double sliding window to find the tightest segment that matches the name
        // This is crucial for side-by-side columns
        for (let start = 0; start < lineItems.length; start++) {
          for (let end = start + 1; end <= lineItems.length; end++) {
            const segment = lineItems.slice(start, end);
            const segmentText = segment.map(it => it.str).join(" ");
            
            if (fuzzyNameMatch(segmentText, target)) {
              // Found a match. Now shrink it from both ends to find the tightest horizontal span.
              let tightStart = start;
              let tightEnd = end;

              // Shrink from left
              while (tightStart < tightEnd - 1) {
                const sub = lineItems.slice(tightStart + 1, tightEnd);
                if (fuzzyNameMatch(sub.map(it => it.str).join(" "), target)) {
                  tightStart++;
                } else {
                  break;
                }
              }

              // Shrink from right
              while (tightEnd > tightStart + 1) {
                const sub = lineItems.slice(tightStart, tightEnd - 1);
                if (fuzzyNameMatch(sub.map(it => it.str).join(" "), target)) {
                  tightEnd--;
                } else {
                  break;
                }
              }

              const bestSegment = lineItems.slice(tightStart, tightEnd);
              const firstItem = bestSegment[0];
              const lastItem = bestSegment[bestSegment.length - 1];
              
              const startX = firstItem.transform[4];
              const endX = lastItem.transform[4] + (lastItem.width || 0);
              const totalWidth = endX - startX;
              
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
      const MAX_WIDTH = 130; 
      const MAX_HEIGHT = 60;  
      
      let sigWidth = Math.min(MAX_WIDTH, Math.max(85, foundPos.textWidth * 1.3));
      let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
      
      if (sigHeight > MAX_HEIGHT) {
        sigHeight = MAX_HEIGHT;
        sigWidth = (sigDims.width / sigDims.height) * sigHeight;
      }

      // HORIZONTAL: Center exactly over the detected name's specific horizontal span
      let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      
      // VERTICAL: Overlap with the middle of the name as requested.
      // Text center is baseline + (height / 2). 
      // We align the signature center to the text center.
      let textCenterY = foundPos.y + (foundPos.textHeight / 2);
      let y = textCenterY - (sigHeight / 2); 
      
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

  // Fallback placement if nothing matched coordinates
  if (totalPlacements === 0 && targetTexts.length > 0) {
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    lastPage.drawImage(signatureImg, {
      x: width - 180,
      y: 80,
      width: 140,
      height: 65,
    });
  }

  return await pdfDoc.save();
}
