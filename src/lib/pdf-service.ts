import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
}

function fuzzyNameMatch(docText: string, targetName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  const docNorm = normalize(docText);
  const targetNorm = normalize(targetName);
  
  if (!docNorm || !targetNorm) return false;
  if (docNorm.includes(targetNorm)) return true;
  
  const targetWords = targetNorm.split(/\s+/).filter(w => w.length >= 2);
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

  // If no targets provided by AI, we can't do anything smart
  if (targetTexts.length === 0) {
    return await pdfDoc.save();
  }

  let placementsCount = 0;

  for (const target of targetTexts) {
    let foundPos: { pageIndex: number; x: number; y: number; textWidth: number; textHeight: number } | null = null;

    // SEARCH BOTTOM-UP for the specific target
    for (let i = pdfJsDoc.numPages; i >= 1; i--) {
      const page = await pdfJsDoc.getPage(i);
      const content = await page.getTextContent();
      
      const lines: { y: number; items: any[] }[] = [];
      for (const item of content.items as any[]) {
        const y = Math.round(item.transform[5]);
        let line = lines.find(l => Math.abs(l.y - y) < 8); // Increased tolerance to 8pt
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      }

      lines.sort((a, b) => a.y - b.y);

      for (const line of lines) {
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = line.items.map(it => it.str).join(" ");

        if (fuzzyNameMatch(lineText, target)) {
          const firstItem = line.items[0];
          const lastItem = line.items[line.items.length - 1];
          const totalWidth = (lastItem.transform[4] + (lastItem.width || 50)) - firstItem.transform[4];
          
          foundPos = {
            pageIndex: i - 1,
            x: firstItem.transform[4],
            y: line.y,
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
      const STANDARD_WIDTH = 130; 
      const MAX_SIG_HEIGHT = 60;  
      
      let sigWidth = STANDARD_WIDTH;
      let sigHeight = (sigDims.height / sigDims.width) * sigWidth;
      
      if (sigHeight > MAX_SIG_HEIGHT) {
        sigHeight = MAX_SIG_HEIGHT;
        sigWidth = (sigDims.width / sigDims.height) * sigHeight;
      }

      let x = foundPos.x + (foundPos.textWidth / 2) - (sigWidth / 2);
      let y = foundPos.y - (sigHeight * 0.45); 
      
      x = Math.max(20, Math.min(x, pageWidth - sigWidth - 20));
      y = Math.max(20, Math.min(y, pageHeight - sigHeight - 20));

      page.drawImage(signatureImg, {
        x,
        y,
        width: sigWidth,
        height: sigHeight,
      });
      placementsCount++;
    }
  }

  // Visual Fallback: If AI detected a name but coordinate engine failed to find it
  if (placementsCount === 0 && targetTexts.length > 0) {
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();
    lastPage.drawImage(signatureImg, {
      x: width - 160,
      y: 100,
      width: 130,
      height: 50,
    });
  }

  return await pdfDoc.save();
}
