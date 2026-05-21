// LLM Service for local API calls

export interface LLMConfig {
  localUrl?: string;
  externalUrl?: string;
  apiKey?: string;
  onFallback?: () => void;
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export class LLMError extends Error {
  status?: number;
  providerName?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.details = details;
  }
}

interface NormalizedUrl {
  base: string;
  extractedKey?: string;
  isNativeGemini: boolean;
}

function normalizeBrowserLocalHost(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === '0.0.0.0') {
      parsed.hostname = '127.0.0.1';
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URLs; downstream validation will catch them
  }
  return url;
}

function normalizeBaseUrl(url: string, providedKey?: string): NormalizedUrl {
  let base = url.trim();
  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = 'http://' + base;
  }
  base = normalizeBrowserLocalHost(base);

  let extractedKey: string | undefined;

  try {
    const parsed = new URL(base);
    if (parsed.searchParams.has('key')) {
      extractedKey = parsed.searchParams.get('key') || undefined;
      if (extractedKey === 'YOUR_API_KEY' && providedKey) {
        extractedKey = providedKey;
      }
      parsed.searchParams.delete('key');
      base = parsed.toString().split('?')[0]; // Strip query
    }
  } catch {
    // ignore
  }

  if (base.includes('generativelanguage.googleapis.com') && base.includes(':generateContent')) {
    return { base, extractedKey, isNativeGemini: true };
  }

  if (base.includes('generativelanguage.googleapis.com')) {
    return { base: 'https://generativelanguage.googleapis.com/v1beta/openai', extractedKey, isNativeGemini: false };
  }

  base = base.replace(/\/$/, ''); // strip trailing slash
  base = base.replace(/\/chat\/completions$/, '');
  base = base.replace(/\/models$/, '');

  if (!base.endsWith('/v1') && !base.includes('/v1/')) {
    base += '/v1';
  }

  return { base, extractedKey, isNativeGemini: false };
}

function getProviderNameFromUrl(url: string): string {
  if (!url) return 'Unknown Provider';
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('google') || lowerUrl.includes('generativelanguage')) return 'Google Gemini';
  if (lowerUrl.includes('openai')) return 'OpenAI';
  if (lowerUrl.includes('anthropic') || lowerUrl.includes('claude')) return 'Anthropic Claude';
  if (lowerUrl.includes('groq')) return 'Groq';
  if (lowerUrl.includes('perplexity')) return 'Perplexity';
  if (lowerUrl.includes('8080')) return 'llama.cpp Server';
  if (lowerUrl.includes('localhost') || lowerUrl.includes('127.0.0.1') || lowerUrl.includes('0.0.0.0')) return 'Local Server';
  return 'External API';
}

function isAnthropicUrl(url: string): boolean {
  return url.toLowerCase().includes('anthropic') || url.toLowerCase().includes('claude');
}

function getAnthropicProxyBase(): string {
  return '/api/anthropic/v1';
}

export function formatDetailedError(error: unknown, providerName: string): LLMError {
  const llmError = error as LLMError;
  const status = llmError.status;
  const errorText = `${llmError.message || ''} ${JSON.stringify(llmError.details || {})}`.toLowerCase();

  let message = `${providerName} API Error: `;
  let fix = 'Please check your settings and try again.';

  if (providerName === 'Anthropic Claude' && errorText.includes('credit balance is too low')) {
    message += 'Insufficient Anthropic Credits.';
    fix = 'Please add credits or upgrade your Anthropic plan, then try again.';
  } else if (status === 401 || status === 403) {
    message += 'Invalid or Missing API Key.';
    fix = 'Please ensure you have entered a valid API Key for this provider.';
  } else if (status === 429) {
    message += 'Rate Limit Exceeded.';
    fix = 'You have hit your API quota or rate limit. Please wait or upgrade your plan.';
  } else if (status && status >= 500) {
    message += 'Provider Server Error.';
    fix = 'The AI provider is currently experiencing issues. Try again later.';
  } else if (status === 400 && errorText.includes('credit balance is too low')) {
    message += 'Insufficient Anthropic Credits.';
    fix = 'Please add credits or upgrade your Anthropic plan, then try again.';
  } else if (errorText.includes('fetch') || errorText.includes('network')) {
    message += 'Network Connection Failed.';
    fix = `Make sure your internet connection is active, or if using a local server, ensure it is running at the configured URL.`;
  } else {
    message += llmError.message || 'Unknown error occurred.';
  }

  const finalError = new LLMError(`${message} Recommended Fix: ${fix}`, status, { providerName, fix });
  finalError.providerName = providerName;
  return finalError;
}

export async function checkConnection(config: LLMConfig): Promise<boolean> {
  const targetUrl = config.externalUrl || config.localUrl;
  if (!targetUrl) return false;

  try {
    const { base, extractedKey, isNativeGemini } = normalizeBaseUrl(targetUrl, config.apiKey);
    const finalKey = config.apiKey || extractedKey;
    const isAnthropic = isAnthropicUrl(base);
    
    let url = `${base}/models`;
    if (isNativeGemini) {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${finalKey}`;
    } else if (isAnthropic) {
      url = `${getAnthropicProxyBase()}/models`;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    
    if (finalKey && !isNativeGemini) {
      if (isAnthropic) {
        headers['x-api-key'] = finalKey;
        headers['anthropic-version'] = '2023-06-01';
        headers['anthropic-dangerous-direct-browser-access'] = 'true';
      } else {
        headers['Authorization'] = `Bearer ${finalKey}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeoutId);
    
    return response.ok;
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'TypeError' || err.message?.includes('fetch')) {
      console.warn('Network Error: Check Private Network Access in browser if calling local IP.');
    }
    return false;
  }
}

async function callGeminiNative(base: string, finalKey: string | undefined, messages: ChatMessage[], temperature: number, signal?: AbortSignal): Promise<string> {
  const endpoint = `${base}?key=${finalKey}`;
  const systemInstruction = messages.find(m => m.role === 'system')?.content;

  const userMessages = messages.filter(m => m.role !== 'system').map(m => {
    let parts: Record<string, unknown>[] = [];
    if (typeof m.content === 'string') {
      parts = [{ text: m.content }];
    } else {
      parts = m.content.map(part => {
        if (part.type === 'text') return { text: part.text };
        if (part.type === 'image_url' && part.image_url) {
          const b64 = part.image_url.url.split(',')[1];
          const mimeType = part.image_url.url.split(';')[0].split(':')[1];
          return { inlineData: { mimeType, data: b64 } };
        }
        return {};
      });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const payload: Record<string, unknown> = {
    contents: userMessages,
    generationConfig: { temperature, maxOutputTokens: 2000 }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: typeof systemInstruction === 'string'
        ? [{ text: systemInstruction }]
        : systemInstruction.map(p => ({ text: p.text }))
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) throw new LLMError(`API error: ${response.statusText}`, response.status);
  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function callAnthropic(finalKey: string | undefined, messages: ChatMessage[], temperature: number, signal?: AbortSignal): Promise<string> {
  const endpoint = `${getAnthropicProxyBase()}/messages`;
  const systemMessage = messages.find(m => m.role === 'system')?.content;
  
  const anthropicMessages = messages.filter(m => m.role !== 'system').map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: [{ type: 'text', text: m.content }] };
    }
    return {
      role: m.role,
      content: m.content.flatMap((part): { type: string; text?: string; source?: unknown }[] => {
        if (part.type === 'text') return [{ type: 'text', text: part.text ?? '' }];
        if (part.type === 'image_url' && part.image_url?.url) {
          const [meta, data] = part.image_url.url.split(',');
          return [{ type: 'image', source: { type: 'base64', media_type: meta.split(';')[0].split(':')[1], data } }];
        }
        return [];
      })
    };
  });

  const payload: Record<string, unknown> = {
    model: 'claude-sonnet-4-5-20250929',
    messages: anthropicMessages,
    max_tokens: 2000,
    temperature,
    ...(systemMessage && { system: typeof systemMessage === 'string' ? systemMessage : systemMessage.map(p => p.text ?? '').join('\n') })
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    ...(finalKey && { 'x-api-key': finalKey })
  };

  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new LLMError(`API error: ${response.statusText}`, response.status, { body: errorBody });
  }

  const data = await response.json();
  return data.content?.map((part: any) => part.text || '').join('') ?? '';
}

async function callOpenAiCompatible(base: string, finalKey: string | undefined, isExternal: boolean, messages: ChatMessage[], temperature: number, signal?: AbortSignal): Promise<string> {
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (finalKey) headers['Authorization'] = `Bearer ${finalKey}`;

  let model = 'local-model';
  if (isExternal) {
    if (endpoint.includes('gemini') || endpoint.includes('generativelanguage')) model = 'gemini-flash-latest';
    else if (endpoint.includes('anthropic') || endpoint.includes('claude')) model = 'claude-sonnet-4-5-20250929';
    else if (endpoint.includes('openai')) model = 'gpt-3.5-turbo';
    else if (endpoint.includes('groq')) model = 'llama3-8b-8192';
    else if (endpoint.includes('perplexity')) model = 'sonar-small-chat';
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature, max_tokens: 2000, stream: false }),
    signal
  });

  if (!response.ok) throw new LLMError(`API error: ${response.statusText}`, response.status);
  const data = await response.json();
  return data.choices[0].message.content;
}

export async function generateCompletion(config: LLMConfig, messages: ChatMessage[], temperature = 0.3, signal?: AbortSignal): Promise<string> {
  const dispatchApiCall = async (url: string, key?: string, isExternal = false) => {
    const { base, extractedKey, isNativeGemini } = normalizeBaseUrl(url, key);
    const finalKey = key || extractedKey;

    if (isNativeGemini) return callGeminiNative(base, finalKey, messages, temperature, signal);
    if (isAnthropicUrl(base)) return callAnthropic(finalKey, messages, temperature, signal);
    return callOpenAiCompatible(base, finalKey, isExternal, messages, temperature, signal);
  };

  if (config.externalUrl && config.localUrl) {
    try {
      return await dispatchApiCall(config.externalUrl, config.apiKey, true);
    } catch (error: unknown) {
      const err = error as LLMError;
      if (err.name === 'AbortError') throw err;

      const isNetworkOrTimeout = err.name === 'TypeError' || err.message?.toLowerCase().includes('fetch') || err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('timeout');
      
      if (err.status === 429 || (err.status && err.status >= 500) || isNetworkOrTimeout) {
        if (config.onFallback) config.onFallback();
        try {
          return await dispatchApiCall(config.localUrl, undefined, false);
        } catch (localError: unknown) {
          throw formatDetailedError(localError, getProviderNameFromUrl(config.localUrl));
        }
      }
      throw formatDetailedError(err, getProviderNameFromUrl(config.externalUrl));
    }
  }

  const targetUrl = config.externalUrl || config.localUrl;
  if (!targetUrl) throw new Error("No AI providers configured.");

  try {
    return await dispatchApiCall(targetUrl, config.apiKey, !!config.externalUrl);
  } catch (error: unknown) {
    throw formatDetailedError(error, getProviderNameFromUrl(targetUrl));
  }
}
