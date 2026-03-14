'use server';
/**
 * @fileOverview A Genkit flow to detect the optimal placement for a digital signature within a PDF text.
 *
 * - detectSignaturePlacement - A function that handles the signature placement detection process.
 * - DetectSignaturePlacementInput - The input type for the detectSignaturePlacement function.
 * - DetectSignaturePlacementOutput - The return type for the detectSignaturePlacement function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DetectSignaturePlacementInputSchema = z.object({
  pdfText: z.string().describe('The extracted text content of the PDF document.'),
  signatoryName: z.string().optional().describe('The name of the signatory to look for, if a specific one is required.'),
});
export type DetectSignaturePlacementInput = z.infer<typeof DetectSignaturePlacementInputSchema>;

const DetectSignaturePlacementOutputSchema = z.object({
  detectedPlacementText: z.string().describe('The exact name of the person who needs to sign.'),
  contextKeyword: z.string().describe("The keyword found (e.g., 'SIGNED BY', 'APPROVED BY')."),
});
export type DetectSignaturePlacementOutput = z.infer<typeof DetectSignaturePlacementOutputSchema>;

export async function detectSignaturePlacement(input: DetectSignaturePlacementInput): Promise<DetectSignaturePlacementOutput> {
  return detectSignaturePlacementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectSignaturePlacementPrompt',
  input: { schema: DetectSignaturePlacementInputSchema },
  output: { schema: DetectSignaturePlacementOutputSchema },
  prompt: `You are a document specialist. Your task is to find where a person should sign a document.

Look at the document text provided below. 
Find signature blocks which usually look like:
"SIGNED BY:"
"NAME"

OR

"APPROVED BY:"
"NAME"

The "NAME" is usually on the line immediately following the keyword like "SIGNED BY" or "APPROVED BY".

Instructions:
1. Ignore "Date", "To:", "From:", "Subject:", reference headers, and other headers at the top of the document.
2. Look for these signature-related keywords: "SIGNED BY", "APPROVED BY", "FOR APPROVAL", "SIGNATURE OF", "REGARDS", "SIGNATURE", "SIGNATURE LINE", "SIGNED", "SIGN HERE", "AUTHORIZED SIGNATURE", "APPLICANT SIGNATURE", "EMPLOYEE SIGNATURE", "CLIENT SIGNATURE", "WITNESS SIGNATURE", "NOTED BY", "VERIFIED BY", "CHECKED BY", "CERTIFIED BY", "AUTHORIZED BY", "ENDORSED BY", "RECOMMENDED BY", "CONFIRMED BY", "VALIDATED BY", "BEST REGARDS", "KIND REGARDS", "SINCERELY", "SINCERELY YOURS", "RESPECTFULLY", "YOURS TRULY", "VERY TRULY YOURS", "PREPARED BY", "RECEIVED BY", "REVIEWED BY", "SUBMITTED BY", "ACKNOWLEDGED BY", "ATTESTED BY", "APPROVED AND SIGNED BY", "AUTHORIZED REPRESENTATIVE", "NAME AND SIGNATURE", "PRINTED NAME AND SIGNATURE", "SIGNATURE OVER PRINTED NAME", "SIGNATURE AND DATE", "SIGNATORY", "DATE SIGNED", "SIGNED THIS DAY OF".
3. Extract the full name directly under, immediately after, or clearly associated with these keywords.
4. If a specific signatoryName is provided ("{{{signatoryName}}}"), look for exactly that name in a signature area.
5. Return only the full name as 'detectedPlacementText'.

Document Text:
---
{{{pdfText}}}
---

Return only JSON.`
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
      return {
        detectedPlacementText: '',
        contextKeyword: '',
      };
    }
    return output;
  }
);
