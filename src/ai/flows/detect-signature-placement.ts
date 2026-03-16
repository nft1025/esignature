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
  prompt: `You are a strict document analysis agent. Your ONLY task is to identify specific signature lines in the provided text.

RULES FOR DETECTION:
1. FOCUS ON SIGNATORY AREAS: Look for names appearing near phrases like "APPROVED BY", "SIGNED BY", "Signature:", "Signatory:", or at the end of sections/documents.
2. IGNORE HEADERS AND SALUTATIONS: Never return names from address blocks, headers, or greetings (e.g., "To: [Name]", "Dear [Name]").
3. PRIORITY MATCHING:
   - If signatoryName IS PROVIDED ("{{{signatoryName}}}"):
     - You MUST ONLY return names that are a semantic match for "{{{signatoryName}}}".
     - A match includes variations with middle initials, full names, or different casing.
     - RETURN THE EXACT STRING AS IT APPEARS IN THE TEXT.
     - IF NO MATCH IS FOUND, RETURN AN EMPTY ARRAY [].

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

      // Final Programmatic Guard: Verify the AI results against the priority input
      if (input.signatoryName) {
        const priority = input.signatoryName.toLowerCase().trim();
        const priorityWords = priority.split(/\s+/).filter(w => w.length >= 2);
        
        const filtered = output.detectedPlacements.filter(detectedName => {
          const detectedNorm = detectedName.toLowerCase().trim();
          // Ensure at least all meaningful priority words are present in the detected name
          return priorityWords.every(word => detectedNorm.includes(word));
        });

        // If priority was provided but no match found, strictly return empty
        return { detectedPlacements: filtered.slice(0, 1) };
      }

      return output;
    } catch (error) {
      console.error('Genkit Flow Error:', error);
      return { detectedPlacements: [] };
    }
  }
);
