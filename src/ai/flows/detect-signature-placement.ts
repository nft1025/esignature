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
  detectedPlacements: z.array(z.string()).describe('A list of EXACT names or entities found in the document requiring signatures.'),
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
1. FOCUS ON SIGNATURE BLOCKS: Look for names or entities (like "Stanley Co.") appearing under headers like "APPROVED BY:", "SIGNED BY:", "REQUESTED BY:", "ENDORSED BY:", "Signature:", "Signatory:", or at the very end of the document.
2. SIDE-BY-SIDE SUPPORT: Be aware that multiple names might appear on the same line (columns). Identify all such names.
3. ENTITY SUPPORT: Signatories can be people or companies (e.g., "Stanley Co.").
4. IGNORE HEADERS: Never return names from letterheads, address blocks, or standard header information at the top of pages.
5. PRIORITY SIGNATORY:
   - If signatoryName is provided ("{{{signatoryName}}}"), you MUST ONLY return that specific name/entity as found in the text.
   - If that name is NOT found in a signature context, return an empty array [].
6. FORMAT: Return only the names, exactly as they appear in the text.

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

      // Strict programmatic filtering for Priority Signatory
      if (input.signatoryName) {
        const priority = input.signatoryName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        
        const filtered = output.detectedPlacements.filter(detectedName => {
          const detectedNorm = detectedName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
          // Basic substring check for robustness against middle initials or trailing punctuation
          return detectedNorm.includes(priority) || priority.includes(detectedNorm);
        });

        // Return only the first valid priority match to avoid duplicate stamping
        return { detectedPlacements: filtered.slice(0, 1) };
      }

      return output;
    } catch (error) {
      console.error('Genkit Flow Error:', error);
      return { detectedPlacements: [] };
    }
  }
);
