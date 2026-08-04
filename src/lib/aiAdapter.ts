export type AiProviderMode = 'ollama' | 'cloud9router';

export interface AiTaskModels {
    meta: string;
    writer: string;
    inspector: string;
    refiner: string;
    imagePrompt: string;
}

export interface AiEngineConfig {
    providerMode: AiProviderMode;
    apiKey?: string;
    baseUrl?: string;
    taskModels: AiTaskModels;
}

export const DEFAULT_AI_CONFIG: AiEngineConfig = {
    providerMode: 'ollama',
    apiKey: '',
    baseUrl: 'https://api.9router.com/v1',
    taskModels: {
        meta: 'gemma4:e4b',
        writer: 'gemma4:e4b',
        inspector: 'gemma4:e4b',
        refiner: 'gemma4:e4b',
        imagePrompt: 'gemma4:e4b',
    },
};

export const DEFAULT_9ROUTER_MODELS: AiTaskModels = {
    meta: 'ag/gemini-3.6-flash-high',
    writer: 'ag/gemini-3.6-flash-high',
    inspector: 'ag/gemini-3.6-flash-high',
    refiner: 'ag/gemini-3.6-flash-high',
    imagePrompt: 'ag/gemini-3.1-flash-image',
};

export interface AiCallOption {
    providerMode?: AiProviderMode;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
}

function resolveBaseUrl(url?: string): string {
    const raw = (url || '').trim();
    if (!raw) return 'https://api.9router.com/v1';
    return raw.replace(/\/+$/, '');
}

/**
 * Streams content response from Ollama or OpenAI-compatible provider (e.g. 9router).
 */
export async function generateContentStream(
    prompt: string,
    systemPrompt?: string,
    options?: AiCallOption
): Promise<ReadableStream> {
    const mode = options?.providerMode || 'ollama';

    if (mode === 'cloud9router') {
        const apiKey = (options?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('Thiếu API Key cho 9router / Cloud API.');
        }

        const baseUrl = resolveBaseUrl(options?.baseUrl);
        const model = (options?.model || 'gpt-4o-mini').trim();

        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                stream: true,
            }),
        });

        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errBody = await response.json();
                errorMsg = errBody.error?.message || errBody.error || response.statusText;
            } catch { /* skip */ }
            throw new Error(`9router Cloud API error (${response.status}): ${errorMsg}`);
        }

        if (!response.body) {
            throw new Error('Không nhận được luồng dữ liệu (Stream) từ Cloud API.');
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Transform SSE chunks (`data: {...}`) to plain text chunks
        const transformStream = new TransformStream({
            transform(chunk, controller) {
                const text = decoder.decode(chunk, { stream: true });
                const lines = text.split('\n');

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments/empty lines
                    if (trimmed === 'data: [DONE]') continue;

                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.slice(6);
                        try {
                            const parsed = JSON.parse(jsonStr);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                controller.enqueue(encoder.encode(content));
                            }
                        } catch {
                            // incomplete line in chunk, continue
                        }
                    }
                }
            },
        });

        return response.body.pipeThrough(transformStream);
    }

    // Default: Ollama local
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = (options?.model || process.env.OLLAMA_MODEL || 'gemma4:e4b').trim();

    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            system: systemPrompt,
            stream: true,
        }),
    });

    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const errBody = await response.json();
            errorMsg = errBody.error || response.statusText;
        } catch { /* skip */ }
        throw new Error(`Ollama local error (${response.status}): ${errorMsg}`);
    }

    if (!response.body) {
        throw new Error('Không nhận được luồng dữ liệu từ Ollama local.');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
        transform(chunk, controller) {
            const textChunk = decoder.decode(chunk, { stream: true });
            const lines = textChunk.split('\n').filter((line) => line.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        controller.enqueue(encoder.encode(parsed.response));
                    }
                } catch { /* skip */ }
            }
        },
    });

    return response.body.pipeThrough(transformStream);
}

/**
 * Non-streaming content generation.
 */
export async function generateContent(
    prompt: string,
    systemPrompt?: string,
    options?: AiCallOption
): Promise<string> {
    const mode = options?.providerMode || 'ollama';

    if (mode === 'cloud9router') {
        const apiKey = (options?.apiKey || '').trim();
        if (!apiKey) {
            throw new Error('Thiếu API Key cho 9router / Cloud API.');
        }

        const baseUrl = resolveBaseUrl(options?.baseUrl);
        const model = (options?.model || 'gpt-4o-mini').trim();

        const messages: Array<{ role: string; content: string }> = [];
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });

        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
            }),
        });

        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errBody = await response.json();
                errorMsg = errBody.error?.message || errBody.error || response.statusText;
            } catch { /* skip */ }
            throw new Error(`9router Cloud API error (${response.status}): ${errorMsg}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || '';
    }

    // Default: Ollama local
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = (options?.model || process.env.OLLAMA_MODEL || 'gemma4:e4b').trim();

    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model,
            prompt,
            system: systemPrompt,
            stream: false,
        }),
    });

    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const errBody = await response.json();
            errorMsg = errBody.error || response.statusText;
        } catch { /* skip */ }
        throw new Error(`Ollama local error (${response.status}): ${errorMsg}`);
    }

    const data = await response.json();
    return data.response || '';
}

/**
 * Queries Ollama local models at http://localhost:11434/api/tags.
 */
export async function getLocalOllamaModels(): Promise<string[]> {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
        const res = await fetch(`${ollamaUrl}/api/tags`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data.models)) {
            return data.models.map((m: { name?: string }) => m.name || '').filter(Boolean);
        }
        return [];
    } catch {
        return [];
    }
}
