import { GoogleGenAI } from '@google/genai';

export interface GeneratePayload {
  provider: string;
  apiKey?: string;
  model?: string;
  prompt: string;
  systemInstruction?: string;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface VisionPayload {
  provider: string;
  apiKey?: string;
  model?: string;
  imageBase64: string;
  mimeType?: string;
  prompt: string;
}

export interface TestConnectionPayload {
  provider: string;
  apiKey?: string;
  model?: string;
}

/**
 * Universal helper to extract clean, human-readable error messages
 * instead of dumping raw JSON strings or ENOTFOUND stack traces.
 */
export function extractCleanErrorMessage(providerName: string, status: number, rawErrText: string): string {
  let cleanMsg = '';

  try {
    const parsed = JSON.parse(rawErrText);
    cleanMsg = parsed?.message || parsed?.error?.message || parsed?.error || parsed?.detail || rawErrText;
  } catch {
    cleanMsg = rawErrText;
  }

  if (typeof cleanMsg === 'object') {
    try {
      cleanMsg = (cleanMsg as any).message || JSON.stringify(cleanMsg);
    } catch {
      cleanMsg = String(cleanMsg);
    }
  }

  const lower = String(cleanMsg).toLowerCase();

  if (lower.includes('enotfound') || lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return `${providerName}: Network endpoint or DNS unreachable. Please check your internet connection or try another provider.`;
  }

  if (status === 429 || lower.includes('rate limit') || lower.includes('quota') || lower.includes('too many requests')) {
    return `${providerName}: Rate limit or API quota reached. Please wait a moment, or switch to Gemini / Groq / OpenRouter in Settings.`;
  }

  if (status === 401 || lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('invalid_api_key')) {
    return `${providerName}: Invalid API key. Please verify your key in Settings.`;
  }

  if (status === 403 || lower.includes('subscription tier') || lower.includes('access')) {
    return `${providerName}: Model not supported on your free key tier. Retrying backup model...`;
  }

  const shortMsg = String(cleanMsg).replace(/[{}"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${providerName} (${status || 'Error'}): ${shortMsg.slice(0, 120)}`;
}

/**
 * Cleanly handles API text generation with server proxy first,
 * falling back seamlessly to direct client-side browser API execution.
 */
export async function executeApiGenerate(payload: GeneratePayload): Promise<string> {
  const {
    provider = 'gemini',
    apiKey = '',
    model,
    prompt,
    systemInstruction,
    jsonMode = false,
    temperature = 0.7,
    maxTokens = 1500,
  } = payload;

  // 1. Try server proxy route first
  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider,
        apiKey,
        model,
        prompt,
        systemInstruction,
        jsonMode,
        temperature,
        maxTokens,
      }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.result) {
        return data.result;
      }
      if (data.error) {
        throw new Error(data.error);
      }
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
    console.warn('Backend proxy unavailable, switching to direct browser AI call:', err?.message || err);
  }

  // 2. Direct client-side execution fallback (for Netlify, Vercel, GitHub Pages)
  return executeDirectClientGenerate({
    provider,
    apiKey,
    model,
    prompt,
    systemInstruction,
    jsonMode,
    temperature,
    maxTokens,
  });
}

/**
 * Direct client-side browser execution for AI providers
 */
async function executeDirectClientGenerate(payload: GeneratePayload): Promise<string> {
  const { provider, apiKey, model, prompt, systemInstruction, jsonMode, temperature = 0.7, maxTokens = 1500 } = payload;

  const cleanSystem = systemInstruction || 'You are SweetPrompts Pro, an expert AI microstock creation assistant for Adobe Stock contributors.';

  // Google Gemini Client
  if (provider === 'gemini') {
    const activeKey = apiKey || (typeof window !== 'undefined' ? (window as any).VITE_GEMINI_API_KEY : '') || '';
    if (!activeKey) {
      throw new Error('Google Gemini API Key is missing. Please enter your Gemini API Key in Settings.');
    }
    const client = new GoogleGenAI({ apiKey: activeKey });
    const targetModel = model || 'gemini-2.5-flash';

    try {
      const response = await client.models.generateContent({
        model: targetModel,
        contents: prompt,
        config: {
          systemInstruction: cleanSystem,
          responseMimeType: jsonMode ? 'application/json' : 'text/plain',
          temperature,
        },
      });
      if (response.text) return response.text;
      throw new Error('Empty response from Gemini');
    } catch (e: any) {
      throw new Error(extractCleanErrorMessage('Google Gemini', 400, e.message || String(e)));
    }
  }

  // Groq Client
  if (provider === 'groq') {
    if (!apiKey) throw new Error('Groq API Key is missing. Please enter your Groq key in Settings.');
    const initialModel = model || 'llama-3.1-8b-instant';
    const candidateModels = Array.from(new Set([initialModel, 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it']));

    let lastGroqErr = '';
    for (const candidate of candidateModels) {
      try {
        const fetchRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: candidate,
            messages: [
              { role: 'system', content: cleanSystem },
              { role: 'user', content: prompt }
            ],
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!fetchRes.ok) {
          lastGroqErr = await fetchRes.text();
          if (fetchRes.status === 404 || fetchRes.status === 429 || fetchRes.status === 403 || lastGroqErr.includes('does not exist') || lastGroqErr.includes('rate limit')) {
            continue;
          }
          throw new Error(extractCleanErrorMessage('Groq', fetchRes.status, lastGroqErr));
        }

        const data = await fetchRes.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (gErr: any) {
        lastGroqErr = gErr.message || String(gErr);
        if (lastGroqErr.includes('does not exist') || lastGroqErr.includes('access') || lastGroqErr.includes('rate limit')) {
          continue;
        }
        throw new Error(extractCleanErrorMessage('Groq', 400, lastGroqErr));
      }
    }

    throw new Error(extractCleanErrorMessage('Groq', 429, lastGroqErr || 'Model not accessible or rate limited'));
  }

  // OpenRouter Client
  if (provider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API Key is missing. Please enter your OpenRouter key in Settings.');
    const initialModel = model || 'google/gemini-2.0-flash-lite-001';
    const candidateModels = Array.from(new Set([
      initialModel,
      'google/gemini-2.0-flash-lite-001',
      'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'deepseek/deepseek-r1:free'
    ]));

    let lastOpenRouterErr = '';
    for (const candidate of candidateModels) {
      try {
        const fetchRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://sweetpromptspro.com',
            'X-Title': 'SweetPrompts Pro',
          },
          body: JSON.stringify({
            model: candidate,
            messages: [
              { role: 'system', content: cleanSystem },
              { role: 'user', content: prompt }
            ],
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!fetchRes.ok) {
          lastOpenRouterErr = await fetchRes.text();
          if (fetchRes.status === 404 || fetchRes.status === 429 || fetchRes.status === 403) {
            continue;
          }
          throw new Error(extractCleanErrorMessage('OpenRouter', fetchRes.status, lastOpenRouterErr));
        }
        const data = await fetchRes.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (oErr: any) {
        lastOpenRouterErr = oErr.message || String(oErr);
        continue;
      }
    }

    throw new Error(extractCleanErrorMessage('OpenRouter', 429, lastOpenRouterErr || 'Rate limited or model unavailable'));
  }

  // Mistral Client
  if (provider === 'mistral') {
    if (!apiKey) throw new Error('Mistral API Key is missing. Please enter your Mistral key in Settings.');
    const initialModel = (model && model !== 'mistral-large-latest') ? model : 'mistral-small-latest';
    const candidateModels = Array.from(new Set([initialModel, 'mistral-small-latest', 'open-mistral-7b', 'open-mistral-nemo']));

    let lastMistralErrText = '';
    for (const candidate of candidateModels) {
      try {
        const fetchRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: candidate,
            messages: [
              { role: 'system', content: cleanSystem },
              { role: 'user', content: prompt }
            ],
            response_format: jsonMode ? { type: 'json_object' } : undefined,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!fetchRes.ok) {
          lastMistralErrText = await fetchRes.text();
          if (fetchRes.status === 403 || fetchRes.status === 429 || lastMistralErrText.includes('rate limit') || lastMistralErrText.includes('subscription tier')) {
            continue;
          }
          throw new Error(extractCleanErrorMessage('Mistral', fetchRes.status, lastMistralErrText));
        }
        const data = await fetchRes.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (mErr: any) {
        lastMistralErrText = mErr.message || String(mErr);
        continue;
      }
    }

    throw new Error(extractCleanErrorMessage('Mistral', 429, lastMistralErrText || 'Rate limit or free quota reached'));
  }

  // Cerebras Client
  if (provider === 'cerebras') {
    if (!apiKey) throw new Error('Cerebras API Key is missing. Please enter your Cerebras key in Settings.');
    const initialModel = model || 'llama3.1-8b';
    const candidateModels = Array.from(new Set([initialModel, 'llama3.1-8b', 'llama-3.3-70b']));

    let lastCerebrasErr = '';
    for (const candidate of candidateModels) {
      try {
        const fetchRes = await fetch('https://api.cerebras.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: candidate,
            messages: [
              { role: 'system', content: cleanSystem },
              { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!fetchRes.ok) {
          lastCerebrasErr = await fetchRes.text();
          continue;
        }
        const data = await fetchRes.json();
        return data.choices?.[0]?.message?.content || '';
      } catch (cErr: any) {
        lastCerebrasErr = cErr.message || String(cErr);
        continue;
      }
    }

    throw new Error(extractCleanErrorMessage('Cerebras', 400, lastCerebrasErr));
  }

  // Hugging Face Client
  if (provider === 'huggingface') {
    if (!apiKey) throw new Error('Hugging Face API Token is missing. Please enter your token in Settings.');
    const initialModel = model || 'meta-llama/Llama-3.2-3B-Instruct';
    const candidateModels = Array.from(new Set([
      initialModel,
      'meta-llama/Llama-3.2-3B-Instruct',
      'meta-llama/Llama-3.2-1B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3'
    ]));

    const endpointsToTry = [
      'https://router.huggingface.co/hf-inference/v1/chat/completions',
      'https://router.huggingface.co/v1/chat/completions',
      'https://api-inference.huggingface.co/v1/chat/completions',
    ];

    let lastHfErr = '';
    for (const endpoint of endpointsToTry) {
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: candidate,
              messages: [
                { role: 'system', content: cleanSystem },
                { role: 'user', content: prompt }
              ],
              temperature,
              max_tokens: maxTokens,
            }),
          });

          if (!fetchRes.ok) {
            lastHfErr = await fetchRes.text();
            continue;
          }
          const data = await fetchRes.json();
          if (data.choices?.[0]?.message?.content) {
            return data.choices[0].message.content;
          }
        } catch (hErr: any) {
          lastHfErr = hErr.message || String(hErr);
          continue;
        }
      }
    }

    throw new Error(extractCleanErrorMessage('Hugging Face', 400, lastHfErr || 'Hugging Face API endpoint unreachable'));
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Vision Analysis Execution (Server proxy with direct browser fallback)
 */
export async function executeApiVision(payload: VisionPayload): Promise<string> {
  const { provider = 'gemini', apiKey = '', model, imageBase64, mimeType = 'image/jpeg', prompt } = payload;

  try {
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, model, imageBase64, mimeType, prompt }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok && data.result) return data.result;
      if (data.error) throw new Error(data.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
    console.warn('Vision proxy unavailable, switching to direct browser call:', err?.message || err);
  }

  // Direct Browser Vision Fallback for Gemini
  if (provider === 'gemini') {
    if (!apiKey) throw new Error('Gemini API Key missing for vision analysis. Please enter your key in Settings.');
    const client = new GoogleGenAI({ apiKey });
    const targetModel = model || 'gemini-2.5-flash';
    const response = await client.models.generateContent({
      model: targetModel,
      contents: [
        { inlineData: { data: imageBase64, mimeType } },
        prompt,
      ],
    });
    if (response.text) return response.text;
  }

  // Direct Browser Vision Fallback for Groq
  if (provider === 'groq') {
    if (!apiKey) throw new Error('Groq API Key missing for vision analysis. Please enter your key in Settings.');
    const visionModel = model || 'llama-3.2-11b-vision-instruct';
    const fetchRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (fetchRes.ok) {
      const data = await fetchRes.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }

  // Direct Browser Vision Fallback for OpenRouter
  if (provider === 'openrouter') {
    if (!apiKey) throw new Error('OpenRouter API Key missing for vision analysis. Please enter your key in Settings.');
    const visionModel = model || 'google/gemini-2.0-flash-001';
    const fetchRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://sweetpromptspro.com',
        'X-Title': 'SweetPrompts Pro',
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    });

    if (fetchRes.ok) {
      const data = await fetchRes.json();
      return data.choices?.[0]?.message?.content || '';
    }
  }

  throw new Error('Vision analysis failed. Please verify your provider API key in Settings.');
}

/**
 * Test Connection Execution
 */
export async function executeApiTestConnection(payload: TestConnectionPayload): Promise<any> {
  const { provider = 'gemini', apiKey = '', model } = payload;

  const startTime = Date.now();

  try {
    const res = await fetch('/api/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, apiKey, model }),
    });

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (res.ok) return data;
      if (data.error) throw new Error(data.error);
    }
  } catch (err: any) {
    if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('Unexpected token')) {
      throw err;
    }
  }

  // Direct Browser Test Execution for Static Deployment (Netlify)
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'No API key provided. Please add your key in Settings.' };
  }

  try {
    const testPrompt = 'Hi';
    await executeDirectClientGenerate({
      provider,
      apiKey,
      model,
      prompt: testPrompt,
      maxTokens: 5,
    });

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      provider,
      message: `Connected to ${provider.toUpperCase()} directly in browser (${latencyMs}ms)`,
      hasText: true,
      hasVision: provider === 'gemini' || provider === 'groq' || provider === 'openrouter' || provider === 'mistral',
      latencyMs,
    };
  } catch (tErr: any) {
    return {
      success: false,
      provider,
      error: tErr.message || 'Connection test failed',
      message: tErr.message || `Failed to connect to ${provider.toUpperCase()}`,
      hasText: false,
      hasVision: false,
      latencyMs: Date.now() - startTime,
    };
  }
}
