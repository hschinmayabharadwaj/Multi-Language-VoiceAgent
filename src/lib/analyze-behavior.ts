'use server';

/**
 * @fileOverview Server action to analyze user messages for suicidal ideation
 * using the trained .pkl model served via Python API.
 *
 * This enhances the existing keyword-based crisis-detection.ts with
 * ML-based analysis from the fine-tuned BERT model.
 */

// ⚠️ Set this to your deployed Python API URL
const ANALYSIS_API_URL = process.env.ANALYSIS_API_URL || 'http://localhost:5000';

export interface BehaviorAnalysis {
  label: 'Non-suicidal' | 'Suicidal ideation';
  confidence: number;
  suicidal_probability: number;
  risk_level: 'low' | 'medium' | 'high';
}

export interface InterventionResult {
  shouldIntervene: boolean;
  riskLevel: string;
  crisisResponse: string;
  analysis: BehaviorAnalysis;
}

/**
 * Calls the Python .pkl model API to analyze a user message.
 * Falls back gracefully if the API is unreachable.
 */
export async function analyzeUserBehavior(text: string): Promise<BehaviorAnalysis> {
  try {
    const response = await fetch(`${ANALYSIS_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      // Timeout after 3 seconds to avoid blocking the chat
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      if (response.status >= 500) {
        console.warn(`[BehaviorAnalysis] API returned ${response.status}, defaulting to safe`);
      }

      return {
        label: 'Non-suicidal',
        confidence: 0,
        suicidal_probability: 0,
        risk_level: 'low',
      };
    }

    return await response.json();
  } catch (error) {
    console.warn('[BehaviorAnalysis] API unreachable, defaulting to safe:', error);
    // If the ML API is down, return safe defaults — don't block the chat
    return {
      label: 'Non-suicidal',
      confidence: 0,
      suicidal_probability: 0,
      risk_level: 'low',
    };
  }
}

/**
 * Analyzes a message and determines if ManasMitra should intervene.
 * Returns intervention details including a compassionate crisis response.
 */
export async function checkAndIntervene(userMessage: string): Promise<InterventionResult> {
  const analysis = await analyzeUserBehavior(userMessage);

  let shouldIntervene = false;
  let crisisResponse = '';

  switch (analysis.risk_level) {
    case 'high':
      shouldIntervene = true;
      crisisResponse =
        "I'm really concerned about what you're sharing with me, and I want you to know " +
        "that you're not alone. What you're feeling right now matters, and so do you. " +
        "Please reach out to someone who can help — the 988 Suicide & Crisis Lifeline " +
        "is available 24/7. You can call or text 988. " +
        "I'm here for you, and I care about your safety.";
      break;

    case 'medium':
      shouldIntervene = true;
      crisisResponse =
        "It sounds like you might be going through a really difficult time right now. " +
        "I hear you, and I want you to know that support is available. " +
        "If you're struggling, the 988 Suicide & Crisis Lifeline is always there — " +
        "call or text 988 anytime. Would you like to talk more about how you're feeling?";
      break;

    case 'low':
    default:
      shouldIntervene = false;
      crisisResponse = '';
      break;
  }

  return {
    shouldIntervene,
    riskLevel: analysis.risk_level,
    crisisResponse,
    analysis,
  };
}
