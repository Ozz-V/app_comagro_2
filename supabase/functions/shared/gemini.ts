export function getGeminiKeys(): string[] {
    const keys: string[] = [];
    const k0 = Deno.env.get('GEMINI_API_KEY');
    if (k0) keys.push(k0);
    for (let i = 1; i <= 5; i++) {
        const k = Deno.env.get(`GEMINI_API_KEY_${i}`);
        if (k) keys.push(k);
    }
    return [...new Set(keys)];
}

// deno-lint-ignore no-explicit-any
export async function fetchWithGeminiRotation(
  url: string,
  fetchOptions: RequestInit,
  // deno-lint-ignore no-explicit-any
  bodyObj: any
): Promise<Response> {
    const keys = getGeminiKeys();
    if (keys.length === 0) throw new Error("No Gemini API keys found in environment.");

    // deno-lint-ignore no-explicit-any
    let lastError: any = null;
    let lastStatus = 500;

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
            const headers = new Headers(fetchOptions.headers || {});
            headers.set('x-goog-api-key', key);
            headers.set('Content-Type', 'application/json');

            const res = await fetch(url, {
                ...fetchOptions,
                headers,
                body: JSON.stringify(bodyObj)
            });

            if (res.ok) {
                return res;
            }

            lastStatus = res.status;
            lastError = await res.text();
            console.warn(`[Gemini Rotation] Key ${i+1}/${keys.length} failed with status ${res.status}: ${lastError.substring(0, 100)}`);
            
        } catch (err) {
            lastError = (err as Error).message;
            console.warn(`[Gemini Rotation] Key ${i+1}/${keys.length} network error: ${lastError}`);
        }
    }

    const err = new Error(`All ${keys.length} Gemini keys failed. Last error: ${lastError}`);
    // deno-lint-ignore no-explicit-any
    (err as any).status = lastStatus;
    throw err;
}
