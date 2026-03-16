'use server';
/**
 * @fileOverview A Genkit flow to detect optimal placements for digital signatures within a PDF text.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DetectSignaturePlacementInputSchema = z.object({
  pdfText: z.string().describe('The extracted text content of the PDF document.'),
  signatoryName: z.string().optional().describe('The name of a specific signatory to look for.'),
});
export type DetectSignaturePlacementInput = z.infer<typeof DetectSignaturePlacementInputSchema>;

const DetectSignaturePlacementOutputSchema = z.object({
  detectedPlacements: z.array(z.string()).describe('A list of EXACT names found in the document text requiring signatures.'),
});
export type DetectSignaturePlacementOutput = z.infer<typeof DetectSignaturePlacementOutputSchema>;

export async function detectSignaturePlacement(input: DetectSignaturePlacementInput): Promise<DetectSignaturePlacementOutput> {
  return detectSignaturePlacementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectSignaturePlacementPrompt',
  input: { schema: DetectSignaturePlacementInputSchema },
  output: { schema: DetectSignaturePlacementOutputSchema },
  prompt: `You are a professional document analysis agent. Your task is to identify formal signature blocks in the provided text.

RULES:
1. FOCUS ON SIGNATURE BLOCKS: Look for names appearing under or near headers like "APPROVED BY:", "SIGNED BY:", "REQUESTED BY:", "ENDORSED BY:", "Signature:", "Signatory:", or at the end of the document.
2. SIDE-BY-SIDE SUPPORT: Be aware that multiple names might appear on the same line (columns). Identify all such names.
3. IGNORE HEADERS: Never return names from letterheads, address blocks, or standard header information.
4. PRIORITY SIGNATORY:
   - If signatoryName is provided ("{{{signatoryName}}}"), you MUST ONLY return that name (or the exact version of it found in the text).
   - If the name is NOT found, return an empty array [].
5. FORMAT: Return only the names, exactly as they appear in the text (e.g., "MARIEL CRISOSTOMO").

Document Text:
---
{{{pdfText}}}
---

Return JSON with 'detectedPlacements' array.`
});

const detectSignaturePlacementFlow = ai.defineFlow(
  {
    name: 'detectSignaturePlacementFlow',
    inputSchema: DetectSignaturePlacementInputSchema,
    outputSchema: DetectSignaturePlacementOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await prompt(input);
      if (!output || !output.detectedPlacements) {
        return { detectedPlacements: [] };
      }

      // Programmatic Guard: If a priority name is set, strictly filter for it.
      if (input.signatoryName) {
        const priority = input.signatoryName.toLowerCase().trim();
        const priorityWords = priority.split(/\s+/).filter(w => w.length >= 2);
        
        const filtered = output.detectedPlacements.filter(detectedName => {
          const detectedNorm = detectedName.toLowerCase().trim();
          // If priority is very short (like "Stanley Co"), use a more lenient word-based match
          if (priorityWords.length < 2) {
             return detectedNorm.includes(priority);
          }
          return priorityWords.every(word => detectedNorm.includes(word));
        });

        // Return the first valid match found
        return { detectedPlacements: filtered.slice(0, 1) };
      }

      return output;
    } catch (error) {
      console.error('Genkit Flow Error:', error);
      return { detectedPlacements: [] };
    }
  }
);
