'use server';

/**
 * @fileOverview A voice agent that provides empathetic conversation.
 *
 * - voiceAgent - A function that generates a spoken response.
 * - textToSpeech - A function that converts text to audio.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { fallback, retry } from '@genkit-ai/ai/model/middleware';
import wav from 'wav';

// Define schemas for the conversational flow
const ConversationInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })).describe('The conversation history.'),
  currentInput: z.string().describe("The user's latest voice input, transcribed to text."),
});

const ConversationOutputSchema = z.object({
  response: z.string().describe("The AI's empathetic and supportive response."),
});

// Define schemas for the TTS flow
const TTSInputSchema = z.object({
  text: z.string().describe('The text to be converted to speech.'),
});

const TTSOutputSchema = z.object({
  audioDataUri: z.string().describe('The base64 encoded WAV audio data URI.'),
});

export type ConversationInput = z.infer<typeof ConversationInputSchema>;
export type ConversationOutput = z.infer<typeof ConversationOutputSchema>;
export type TTSInput = z.infer<typeof TTSInputSchema>;
export type TTSOutput = z.infer<typeof TTSOutputSchema>;

// Define schemas for speech-to-text
const STTInputSchema = z.object({
  audioDataUri: z.string().describe('Base64 encoded audio data URI from the microphone.'),
});

const STTOutputSchema = z.object({
  transcript: z.string().describe('The transcribed text from the audio.'),
});

export type STTInput = z.infer<typeof STTInputSchema>;
export type STTOutput = z.infer<typeof STTOutputSchema>;

export async function voiceAgent(input: ConversationInput): Promise<ConversationOutput> {
  return voiceAgentFlow(input);
}

export async function textToSpeech(input: TTSInput): Promise<TTSOutput> {
  return textToSpeechFlow(input);
}

export async function speechToText(input: STTInput): Promise<STTOutput> {
  return speechToTextFlow(input);
}


// Optimized helper function to convert PCM audio data from Gemini to WAV format
async function toWav(pcmData: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            const writer = new wav.Writer({
                channels: 1,
                sampleRate: 24000,
                bitDepth: 16,
            });

            const buffers: Buffer[] = [];
            
            writer.on('data', (chunk) => buffers.push(chunk));
            writer.on('end', () => {
                try {
                    const finalBuffer = Buffer.concat(buffers);
                    resolve(finalBuffer.toString('base64'));
                } catch (error) {
                    reject(error);
                }
            });
            writer.on('error', reject);

            // Process audio data efficiently
            writer.write(pcmData);
            writer.end();
        } catch (error) {
            reject(error);
        }
    });
}

const voiceAgentPrompt = ai.definePrompt({
    name: 'voiceAgentPrompt',
    input: { schema: ConversationInputSchema },
    output: { schema: ConversationOutputSchema },
    prompt: `You are ManasMitra, a caring and empathetic voice assistant designed to provide mental wellness support. Your goal is to listen to the user, validate their feelings, and gently guide them towards self-reflection and confidence.

- **Listen Deeply:** Pay close attention to the user's words and the underlying emotions.
- **Be Empathetic:** Start by acknowledging their feelings (e.g., "It sounds like you're going through a lot," "I hear how difficult that must be.").
- **Ask Gentle Questions:** Encourage them to explore their feelings without being intrusive (e.g., "What does that feel like for you?", "Can you tell me more about that?").
- **Offer Encouragement:** Instill hope and reinforce their strengths (e.g., "It takes courage to talk about this," "Remember that you've overcome challenges before.").
- **Keep it Conversational:** Your responses should be natural, supportive, and not overly clinical. Keep responses to 1-2 sentences maximum for faster voice generation and natural conversation flow.
- **Do not give medical advice.** Gently redirect if the user asks for a diagnosis or treatment plan.

Conversation History:
{{#each history}}
- {{role}}: {{content}}
{{/each}}

User's current input: "{{currentInput}}"

Your response:`
});

const voiceAgentFlow = ai.defineFlow(
    {
      name: 'voiceAgentFlow',
      inputSchema: ConversationInputSchema,
      outputSchema: ConversationOutputSchema,
    },
    async (input) => {
        try {
          const { output } = await voiceAgentPrompt(input);
          return output!;
        } catch (error) {
          console.warn('[VoiceAgent] Model unavailable, using safe fallback:', error);

          return {
            response:
              "I'm here with you, but I'm having trouble connecting right now. Please try again in a moment, or tell me what you're feeling and I'll do my best to help.",
          };
        }
    }
);

const textToSpeechFlow = ai.defineFlow(
  {
    name: 'textToSpeechFlow',
    inputSchema: TTSInputSchema,
    outputSchema: TTSOutputSchema,
  },
  async ({ text }) => {
    const { media } = await ai.generate({
      model: 'googleai/gemini-2.5-flash-preview-tts',
      use: [
        retry({
          maxRetries: 1,
          statuses: ['UNAVAILABLE', 'DEADLINE_EXCEEDED'],
          initialDelayMs: 250,
          noJitter: true,
        }),
        fallback(ai, {
          models: ['googleai/gemini-2.5-pro-preview-tts'],
          statuses: ['RESOURCE_EXHAUSTED'],
        }),
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Algenib' },
          },
        },
        // Optimize for faster generation
        maxOutputTokens: 1000, // Limit response length for faster processing
        temperature: 0.7, // Slightly reduce creativity for more consistent responses
      },
      prompt: text,
    });
    if (!media) {
      throw new Error('No audio was generated from the TTS model.');
    }
    const audioBuffer = Buffer.from(media.url.substring(media.url.indexOf(',') + 1), 'base64');
    const wavBase64 = await toWav(audioBuffer);
    
    return {
        audioDataUri: `data:audio/wav;base64,${wavBase64}`
    };
  }
);

const speechToTextFlow = ai.defineFlow(
  {
    name: 'speechToTextFlow',
    inputSchema: STTInputSchema,
    outputSchema: STTOutputSchema,
  },
  async ({ audioDataUri }) => {
    const { text } = await ai.generate({
      model: 'googleai/gemini-2.5-flash-lite',
      prompt: [
        { media: { url: audioDataUri } },
        { text: 'Transcribe this audio exactly as spoken. Return only the transcription, nothing else.' },
      ],
    });
    return { transcript: text?.trim() || '' };
  }
);
