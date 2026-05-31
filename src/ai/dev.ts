'use server';
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

import '@/ai/flows/daily-affirmations.ts';
import '@/ai/flows/contextual-resource-recommendation.ts';
import '@/ai/flows/empathetic-response-to-daily-checkin.ts';
import '@/ai/flows/story-analysis-flow.ts';
import '@/ai/flows/choice-analysis-flow.ts';
import '@/ai/flows/voice-agent-flow.ts';
import '@/ai/flows/chat-flow.ts';
