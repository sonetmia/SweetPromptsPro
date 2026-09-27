import { GoogleGenAI } from '@google/genai';

const GEMINI_TEXT_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
];

function extractCleanErrorMessage(providerName: string, status: number, rawErrText: string): string {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      prompt, 
      provider = 'gemini', 
      apiKey, 
      model, 
      systemInstruction, 
      jsonMode,
      temperature = 0.7,
      maxTokens = 1500
    } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const cleanSystem = systemInstruction || 'You are SweetPrompts Pro, an expert AI microstock creation assistant for Adobe Stock contributors.';

    // Gemini Provider
    if (provider === 'gemini') {
      const clientKey = typeof apiKey === 'string' ? apiKey.trim() : '';
      const systemEnvKey = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || '').trim();

      const keysToTry: string[] = [];
      if (clientKey) keysToTry.push(clientKey);
      if (systemEnvKey && systemEnvKey !== clientKey) keysToTry.push(systemEnvKey);

      if (keysToTry.length === 0) {
        return res.status(400).json({ error: 'Gemini API key not configured. Please add your key in Settings or switch AI providers.' });
      }

      const primaryModel = model || 'gemini-2.5-flash';
      const candidateModels = [
        primaryModel,
        ...GEMINI_TEXT_FALLBACKS.filter((m) => m !== primaryModel)
      ];

      let lastError: any = null;

      for (const currentKey of keysToTry) {
        const client = new GoogleGenAI({ apiKey: currentKey });
        for (const candidate of candidateModels) {
          try {
            const response = await client.models.generateContent({
              model: candidate,
              contents: prompt,
              config: {
                systemInstruction: cleanSystem,
                responseMimeType: jsonMode ? 'application/json' : 'text/plain',
                temperature,
              },
            });

            if (response.text) {
              return res.status(200).json({ result: response.text, modelUsed: candidate });
            }
          } catch (modelErr: any) {
            lastError = modelErr;
            const errStr = String(modelErr?.message || modelErr);
            if (errStr.includes('API key not valid') || errStr.includes('API_KEY_INVALID') || errStr.includes('INVALID_ARGUMENT')) {
              break;
            }
            if (errStr.includes('429') || errStr.includes('Quota exceeded') || errStr.includes('RESOURCE_EXHAUSTED')) {
              continue;
            }
          }
        }
      }

      if (lastError) {
        return res.status(400).json({ error: extractCleanErrorMessage('Google Gemini', 400, lastError.message || String(lastError)) });
      }
      return res.status(500).json({ error: 'Failed to generate content with Gemini.' });
    }

    // Groq Provider
    if (provider === 'groq') {
      const groqKey = apiKey || process.env.GROQ_API_KEY;
      if (!groqKey) return res.status(400).json({ error: 'Groq API key not configured. Please add your key in Settings.' });

      const initialModel = model || 'llama-3.1-8b-instant';
      const candidateModels = Array.from(new Set([initialModel, 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'llama3-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it']));

      let lastGroqErr: any = null;
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqKey}`,
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
            const errText = await fetchRes.text();
            if (fetchRes.status === 404 || fetchRes.status === 429 || fetchRes.status === 403 || errText.includes('does not exist') || errText.includes('model_not_found') || errText.includes('access')) {
              lastGroqErr = extractCleanErrorMessage('Groq', fetchRes.status, errText);
              continue;
            }
            return res.status(fetchRes.status).json({ error: extractCleanErrorMessage('Groq', fetchRes.status, errText) });
          }

          const data = await fetchRes.json();
          return res.status(200).json({ result: data.choices?.[0]?.message?.content || '', modelUsed: candidate });
        } catch (gErr: any) {
          lastGroqErr = gErr.message || String(gErr);
          continue;
        }
      }

      return res.status(400).json({ error: extractCleanErrorMessage('Groq', 429, lastGroqErr || 'Rate limit or model access error') });
    }

    // OpenRouter Provider
    if (provider === 'openrouter') {
      const orKey = apiKey || process.env.OPENROUTER_API_KEY;
      if (!orKey) return res.status(400).json({ error: 'OpenRouter API key not configured.' });

      const initialModel = model || 'google/gemini-2.0-flash-lite-001';
      const candidateModels = Array.from(new Set([
        initialModel,
        'google/gemini-2.0-flash-lite-001',
        'meta-llama/llama-3.3-70b-instruct',
        'meta-llama/llama-3.1-8b-instruct:free',
        'mistralai/mistral-7b-instruct:free',
        'deepseek/deepseek-r1:free'
      ]));

      let lastOrErr = '';
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${orKey}`,
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
            lastOrErr = await fetchRes.text();
            if (fetchRes.status === 404 || fetchRes.status === 429 || fetchRes.status === 403) {
              continue;
            }
            return res.status(fetchRes.status).json({ error: extractCleanErrorMessage('OpenRouter', fetchRes.status, lastOrErr) });
          }
          const data = await fetchRes.json();
          return res.status(200).json({ result: data.choices?.[0]?.message?.content || '', modelUsed: candidate });
        } catch (oErr: any) {
          lastOrErr = oErr.message || String(oErr);
          continue;
        }
      }

      return res.status(400).json({ error: extractCleanErrorMessage('OpenRouter', 429, lastOrErr || 'Rate limited or model unavailable') });
    }

    // Mistral Provider
    if (provider === 'mistral') {
      const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
      if (!mistralKey) return res.status(400).json({ error: 'Mistral API key not configured.' });

      const initialModel = (model && model !== 'mistral-large-latest') ? model : 'mistral-small-latest';
      const candidateModels = Array.from(new Set([initialModel, 'mistral-small-latest', 'open-mistral-7b', 'open-mistral-nemo']));

      let lastMistralErr = '';
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${mistralKey}`,
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
            lastMistralErr = await fetchRes.text();
            if (fetchRes.status === 403 || fetchRes.status === 429 || lastMistralErr.includes('subscription tier') || lastMistralErr.includes('rate limit')) {
              continue; // Try next candidate
            }
            return res.status(fetchRes.status).json({ error: extractCleanErrorMessage('Mistral', fetchRes.status, lastMistralErr) });
          }

          const data = await fetchRes.json();
          return res.status(200).json({ result: data.choices?.[0]?.message?.content || '', modelUsed: candidate });
        } catch (mErr: any) {
          lastMistralErr = mErr.message || String(mErr);
          continue;
        }
      }

      return res.status(400).json({ error: extractCleanErrorMessage('Mistral', 429, lastMistralErr || 'Rate limit or free tier quota reached') });
    }

    // Cerebras Provider
    if (provider === 'cerebras') {
      const cKey = apiKey || process.env.CEREBRAS_API_KEY;
      if (!cKey) return res.status(400).json({ error: 'Cerebras API key not configured.' });

      const initialModel = model || 'llama3.1-8b';
      const candidateModels = Array.from(new Set([initialModel, 'llama3.1-8b', 'llama-3.3-70b']));

      let lastCErr = '';
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch('https://api.cerebras.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${cKey}`,
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
            lastCErr = await fetchRes.text();
            continue;
          }

          const data = await fetchRes.json();
          return res.status(200).json({ result: data.choices?.[0]?.message?.content || '', modelUsed: candidate });
        } catch (cErr: any) {
          lastCErr = cErr.message || String(cErr);
          continue;
        }
      }

      return res.status(400).json({ error: extractCleanErrorMessage('Cerebras', 400, lastCErr) });
    }

    // Hugging Face Provider
    if (provider === 'huggingface') {
      const hfKey = apiKey || process.env.HUGGINGFACE_API_KEY;
      if (!hfKey) return res.status(400).json({ error: 'Hugging Face API key not configured.' });

      const initialModel = model || 'meta-llama/Llama-3.2-3B-Instruct';
      const candidateModels = Array.from(new Set([initialModel, 'meta-llama/Llama-3.2-3B-Instruct', 'meta-llama/Llama-3.2-1B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3']));

      let lastHfErr = '';
      for (const candidate of candidateModels) {
        try {
          const fetchRes = await fetch('https://api-inference.huggingface.co/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${hfKey}`,
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
          return res.status(200).json({ result: data.choices?.[0]?.message?.content || '', modelUsed: candidate });
        } catch (hErr: any) {
          lastHfErr = hErr.message || String(hErr);
          continue;
        }
      }

      return res.status(400).json({ error: extractCleanErrorMessage('Hugging Face', 400, lastHfErr) });
    }

    return res.status(400).json({ error: `Unsupported AI provider: ${provider}` });
  } catch (err: any) {
    return res.status(500).json({ error: extractCleanErrorMessage('AI Service', 500, err.message || String(err)) });
  }
}
