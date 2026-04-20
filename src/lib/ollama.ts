export async function generateContentStream(prompt: string, systemPrompt?: string): Promise<ReadableStream> {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';

    const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model,
            prompt: prompt,
            system: systemPrompt,
            stream: true,
        }),
    });

    if (!response.ok) {
        let errorMsg = 'Unknown error';
        try {
            const errBody = await response.json();
            errorMsg = errBody.error || response.statusText;
        } catch {
            errorMsg = response.statusText;
        }
        throw new Error(`Ollama API error: ${response.status} - ${errorMsg}`);
    }

    if (!response.body) {
        throw new Error('No response body from Ollama');
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Create a TransformStream to parse Ollama's JSON format and output plain text chunks
    const transformStream = new TransformStream({
        transform(chunk, controller) {
            const textChunk = decoder.decode(chunk);
            const lines = textChunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.response) {
                        controller.enqueue(encoder.encode(parsed.response));
                    }
                } catch (e) {
                    console.error('Failed to parse stream line from Ollama:', line, e);
                }
            }
        }
    });

    return response.body.pipeThrough(transformStream);
}

/**
 * Non-streaming version — returns full text response.
 * Used internally by the auto-refine loop.
 */
export async function generateContent(prompt: string, systemPrompt?: string): Promise<string> {
    const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'gemma4:e4b';

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
        let errorMsg = 'Unknown error';
        try {
            const errBody = await response.json();
            errorMsg = errBody.error || response.statusText;
        } catch {
            errorMsg = response.statusText;
        }
        throw new Error(`Ollama API error: ${response.status} - ${errorMsg}`);
    }

    const data = await response.json();
    return data.response || '';
}
