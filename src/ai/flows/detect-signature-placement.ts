'use server';
/**
 * @fileOverview A Genkit flow to detect optimal placements for digital signatures within a PDF text.
 *
 * - detectSignaturePlacement - A function that handles the signature placement detection process.
 * - DetectSignaturePlacementInput - The input type for the detectSignaturePlacement function.
 * - DetectSignaturePlacementOutput - The return type for the detectSignaturePlacement function.
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
1. IGNORE HEADERS AND SALUTATIONS: Never return names from address blocks, headers, or greetings (e.g., "Dear Mr. [Name]", "To: [Name]").
2. FOCUS ON SIGNATURE BLOCKS: Only look for names appearing at the very end of the document, typically after closing phrases like "APPROVED BY", "SIGNED BY", "Sincerely", "Regards", or near formal title blocks.
3. STRICT PRIORITY FILTERING:
   - If a signatoryName IS PROVIDED ("{{{signatoryName}}}"):
     - You MUST ONLY return a name from the document that is a semantic match for "{{{signatoryName}}}".
     - A match includes variations with middle initials or different casing.
     - IF NO SEMANTIC MATCH IS FOUND IN A SIGNATURE AREA, RETURN AN EMPTY ARRAY [].
     - Return the EXACT string of the name as it appears in the document text.
   - If NO signatoryName IS PROVIDED:
     - Detect all primary signatories at the end of the document.

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

      // Final Programmatic Guard: Verify the AI results against the user's priority input
      if (input.signatoryName) {
        const priority = input.signatoryName.toLowerCase().trim();
        const priorityWords = priority.split(/\s+/).filter(w => w.length > 1);
        
        const filtered = output.detectedPlacements.filter(detectedName => {
          const detectedNorm = detectedName.toLowerCase().trim();
          // Ensure ALL major words from the priority input are present in the detected name
          return priorityWords.every(word => detectedNorm.includes(word));
        });

        // Strictly return only the top match if a priority name was specified
        return { detectedPlacements: filtered.slice(0, 1) };
      }

      return output;
    } catch (error) {
      console.error('Genkit Flow Error:', error);
      return { detectedPlacements: [] };
    }
  }
);
