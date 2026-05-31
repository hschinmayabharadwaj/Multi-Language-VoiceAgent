import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

const envPaths = [
  resolve(process.cwd(), '.env.local'),
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'public/.env'),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash-lite',
});
