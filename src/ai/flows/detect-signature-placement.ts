
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
  detectedPlacements: z.array(z.string()).describe('A list of names identified as requiring signatures.'),
});
export type DetectSignaturePlacementOutput = z.infer<typeof DetectSignaturePlacementOutputSchema>;

export async function detectSignaturePlacement(input: DetectSignaturePlacementInput): Promise<DetectSignaturePlacementOutput> {
  return detectSignaturePlacementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectSignaturePlacementPrompt',
  input: { schema: DetectSignaturePlacementInputSchema },
  output: { schema: DetectSignaturePlacementOutputSchema },
  prompt: `You are a document specialist. Your task is to identify where signatures are required in a document.

Look for signature blocks which usually feature keywords like "SIGNED BY", "APPROVED BY", "NAME", "SIGNATURE", etc.

Instructions:
1. If a specific signatoryName is provided ("{{{signatoryName}}}"), look specifically for that name in a signature context and return ONLY that name in the 'detectedPlacements' array.
2. If no signatoryName is provided, find ALL people who appear to be signatories (e.g., names listed under "APPROVED BY", "WITNESS", "CLIENT", "PREPARED BY").
3. Return an array of these names as 'detectedPlacements'.

Keywords to help identify signature blocks: "SIGNED BY", "APPROVED BY", "FOR APPROVAL", "SIGNATURE OF", "REGARDS", "SIGNATURE LINE", "AUTHORIZED SIGNATURE", "APPLICANT SIGNATURE", "EMPLOYEE SIGNATURE", "CLIENT SIGNATURE", "WITNESS SIGNATURE", "NOTED BY", "VERIFIED BY", "CHECKED BY", "CERTIFIED BY", "AUTHORIZED BY", "ENDORSED BY", "RECOMMENDED BY", "CONFIRMED BY", "VALIDATED BY", "BEST REGARDS", "KIND REGARDS", "SINCERELY", "RESPECTFULLY", "PREPARED BY", "RECEIVED BY", "REVIEWED BY", "SUBMITTED BY", "ACKNOWLEDGED BY", "ATTESTED BY", "AUTHORIZED REPRESENTATIVE", "SIGNATORY".

Document Text:
---
{{{pdfText}}}
---

Return JSON.`
});

const detectSignaturePlacementFlow = ai.defineFlow(
  {
    name: 'detectSignaturePlacementFlow',
    inputSchema: DetectSignaturePlacementInputSchema,
    outputSchema: DetectSignaturePlacementOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      return { detectedPlacements: [] };
    }
    return output;
  }
);
