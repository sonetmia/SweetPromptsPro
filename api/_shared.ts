/**
 * Shared server-side helpers for SweetPrompts Pro API routes.
 *
 * Single source of truth for Gemini fallback model lists and provider
 * error-message cleaning. Used by both the Express dev server (server.ts)
 * and the Vercel serverless functions (api/*.ts) so the two implementations
 * can no longer drift apart.
 *
 * NOTE: filenames starting with "_" are ignored by Vercel's routing,
 * so this file never becomes an API endpoint.
 */

/** Fallback chain for Gemini text generation (most capable first). */
export const GEMINI_TEXT_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

/** Fallback chain for Gemini vision analysis (most capable first). */
export const GEMINI_VISION_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

/**
 * Turn a raw provider error (Error object, string, or anything else) into a
 * short, human-readable message. `status` is the HTTP status when known
 * (e.g. from a fetch response); it is optional.
 */
export function cleanProviderError(provider: string, raw: unknown, status?: number): string {
  let text = '';
  if (!raw) {
    text = '';
  } else if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Error) {
    text = raw.message || String(raw);
  } else {
    try {
      text = (raw as { message?: unknown }).message as string || JSON.stringify(raw);
    } catch {
      text = String(raw);
    }
  }

  if (!text) return `${provider} request failed`;

  // Try to pull a message out of embedded JSON first.
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.error?.code === 429 || parsed.error?.status === 'RESOURCE_EXHAUSTED') {
        return `${provider}: API quota or rate limit reached. Please wait a moment, or switch to Groq / Mistral / OpenRouter in Settings.`;
      }
      if (parsed.error?.reason === 'API_KEY_INVALID' || parsed.error?.message?.includes('API key not valid')) {
        return `${provider}: Invalid API Key. Please enter a valid API key in Settings or switch AI providers.`;
      }
      const msg = parsed.error?.message || parsed.error || parsed.message;
      if (msg) text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    } else {
      const parsed = JSON.parse(text);
      const msg = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.detail;
      if (msg) text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    }
  } catch {
    // Not JSON — keep the raw text.
  }

  const lower = text.toLowerCase();

  if (
    status === 429 ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('quota') ||
    lower.includes('too many requests') ||
    lower.includes('resource_exhausted')
  ) {
    return `${provider}: API quota or rate limit reached. Please wait a moment, or switch to Groq / Mistral / OpenRouter in Settings.`;
  }

  if (
    status === 401 ||
    lower.includes('api key not valid') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid_api_key') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid_argument')
  ) {
    return `${provider}: Invalid API Key. Please enter a valid API key in Settings or switch AI providers.`;
  }

  if (status === 403 || lower.includes('subscription tier')) {
    return `${provider}: Model not supported on your key tier. Retrying backup model...`;
  }

  const shortMsg = text.replace(/[{}\"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return status
    ? `${provider} (${status}): ${shortMsg.slice(0, 120)}`
    : `${provider}: ${shortMsg.slice(0, 160)}`;
}
