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
  detectedPlacementText: z.string().describe('The exact line of text (e.g., signatory name) above which the signature should be placed.'),
  contextKeyword: z.string().describe("The keyword (e.g., 'APPROVED BY', 'SIGNED BY') that indicates the signature placement."),
});
export type DetectSignaturePlacementOutput = z.infer<typeof DetectSignaturePlacementOutputSchema>;

export async function detectSignaturePlacement(input: DetectSignaturePlacementInput): Promise<DetectSignaturePlacementOutput> {
  return detectSignaturePlacementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectSignaturePlacementPrompt',
  input: { schema: DetectSignaturePlacementInputSchema },
  output: { schema: DetectSignaturePlacementOutputSchema },
  prompt: `You are an expert document analyst tasked with identifying the correct placement for a digital signature within a document.
Your goal is to find specific keywords that indicate signature areas and then identify the signatory's name directly below them.
The keywords to look for are: 'APPROVED BY', 'FOR APPROVAL', 'SIGNED BY', and similar phrases affirming the need for a signature.

Analyze the provided PDF text and perform the following steps:
1.  Scan the text for any of the keywords listed above.
2.  If a keyword is found, look for a name directly below it. This name is the signatory.
3.  If a specific signatory name is provided, prioritize finding that name below one of the keywords. If no specific signatory name is provided, identify the first appropriate signatory name found below a keyword.
4.  Extract the exact text of the signatory's name (the line where the signature should be placed above) and the keyword that led to its identification.

If multiple suitable placements are found, return the first one encountered in the document text.
If no suitable placement is found, return empty strings for 'detectedPlacementText' and 'contextKeyword'.

Here is the PDF text:
---
{{{pdfText}}}
---

{{#if signatoryName}}
The specific signatory name to prioritize is: "{{{signatoryName}}}"
{{/if}}

Please provide the output in JSON format, strictly adhering to the following structure, and do not include any other text or explanation outside the JSON:
`
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
