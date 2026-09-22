export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err: any) {
        clearTimeout(id);
        if (err.name === "AbortError") throw new Error("Timeout na chamada ao serviço externo.");
        throw err;
    }
}