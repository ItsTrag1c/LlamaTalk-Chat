function validateOllamaUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid Ollama URL: ${urlStr}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ollama URL must use http or https");
  }
  if (/^169\.254\./i.test(parsed.hostname)) {
    throw new Error("Link-local addresses are not permitted");
  }
}

function fetchWithTimeout(url, options, timeoutMs, cancelSignal = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let cancelListener;
  if (cancelSignal) {
    if (cancelSignal.aborted) {
      controller.abort();
    } else {
      cancelListener = () => controller.abort();
      cancelSignal.addEventListener("abort", cancelListener);
    }
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    if (cancelSignal && cancelListener) {
      cancelSignal.removeEventListener("abort", cancelListener);
    }
  });
}

export const CLOUD_MODELS = {
  anthropic: ["claude-opus-4-5", "claude-sonnet-4-5", "claude-3-5-haiku-20241022"],
  google:    ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
  openai:    ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"],
};

export function getProvider(model, config) {
  for (const [provider, models] of Object.entries(CLOUD_MODELS)) {
    if (models.includes(model)) return provider;
  }
  return "ollama";
}

export async function getOllamaModels(url) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/api/tags`, {}, 10_000);
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m) => m.name);
}

export async function callOllama(messages, model, url, temperature = 0.7, signal = null) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature } }),
    },
    120_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.message?.content ?? "";
}

export async function callAnthropic(messages, model, systemText, apiKey, temperature = 0.7, signal = null) {
  const body = {
    model,
    max_tokens: 4096,
    messages: messages.filter((m) => m.role !== "system"),
    temperature,
  };
  if (systemText) body.system = systemText;

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    60_000,
    signal
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

export async function callGoogle(messages, model, systemText, apiKey, temperature = 0.7, signal = null) {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body = { contents, generationConfig: { temperature } };
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    60_000,
    signal
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export async function callOpenAI(messages, model, apiKey, temperature = 0.7, signal = null) {
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature }),
    },
    60_000,
    signal
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export async function sendMessage(messages, config, systemPrompt, signal = null) {
  const model = config.selectedModel;
  const provider = getProvider(model, config);
  const temperature = config.temperature ?? 0.7;

  if (provider === "ollama") {
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    return await callOllama(msgs, model, config.ollamaUrl, temperature, signal);
  }

  if (provider === "anthropic") {
    if (!config.apiKey_anthropic) throw new Error("Anthropic API key not set. Use /set api-key anthropic <key>");
    return await callAnthropic(messages, model, systemPrompt, config.apiKey_anthropic, temperature, signal);
  }

  if (provider === "google") {
    if (!config.apiKey_google) throw new Error("Google API key not set. Use /set api-key google <key>");
    return await callGoogle(messages, model, systemPrompt, config.apiKey_google, temperature, signal);
  }

  if (provider === "openai") {
    if (!config.apiKey_openai) throw new Error("OpenAI API key not set. Use /set api-key openai <key>");
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    return await callOpenAI(msgs, model, config.apiKey_openai, temperature, signal);
  }

  throw new Error(`Unknown provider for model: ${model}`);
}

// ---------------------------------------------------------------------------
// Backend detection (Ollama vs OpenAI-compatible)
// ---------------------------------------------------------------------------

export async function detectBackend(url) {
  const base = url.replace(/\/$/, "");
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, {}, 10_000);
    if (res.ok) return "ollama";
  } catch { /* try next */ }
  try {
    const res = await fetchWithTimeout(`${base}/v1/models`, {}, 10_000);
    if (res.ok) return "openai-compatible";
  } catch { /* neither responded */ }
  return "unknown";
}

export async function getOpenAICompatModels(url) {
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/v1/models`, {}, 10_000);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

// ---------------------------------------------------------------------------
// Line-buffered SSE/NDJSON parser for streaming responses
// ---------------------------------------------------------------------------

async function* streamLines(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const nl = buf.indexOf("\n");
      if (nl === -1) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield line;
    }
  }
  if (buf.trim()) yield buf.trim();
}

// ---------------------------------------------------------------------------
// Per-provider streaming functions
// ---------------------------------------------------------------------------

async function streamOllama(messages, model, url, temperature, onToken, signal) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature } }),
    },
    300_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    try {
      const obj = JSON.parse(line);
      if (obj.message?.content) onToken(obj.message.content);
      if (obj.done) break;
    } catch { /* skip malformed lines */ }
  }
}

async function streamOpenAICompat(messages, model, url, temperature, onToken, signal) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(
    `${base}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, temperature }),
    },
    300_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server error ${res.status}: ${text}`);
  }
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const obj = JSON.parse(data);
      const token = obj.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    } catch { /* skip */ }
  }
}

async function streamAnthropic(messages, model, systemText, apiKey, temperature, onToken, signal) {
  const body = {
    model,
    max_tokens: 4096,
    messages: messages.filter((m) => m.role !== "system"),
    temperature,
    stream: true,
  };
  if (systemText) body.system = systemText;

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    },
    120_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${text}`);
  }
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6));
      if (obj.type === "content_block_delta" && obj.delta?.text) {
        onToken(obj.delta.text);
      }
      if (obj.type === "message_stop") break;
    } catch { /* skip */ }
  }
}

async function streamGoogle(messages, model, systemText, apiKey, temperature, onToken, signal) {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const body = { contents, generationConfig: { temperature } };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    120_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google error ${res.status}: ${text}`);
  }
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6));
      const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) onToken(text);
    } catch { /* skip */ }
  }
}

async function streamOpenAI(messages, model, apiKey, temperature, onToken, signal) {
  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, stream: true }),
    },
    120_000,
    signal
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text}`);
  }
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const obj = JSON.parse(data);
      const token = obj.choices?.[0]?.delta?.content;
      if (token) onToken(token);
    } catch { /* skip */ }
  }
}

// ---------------------------------------------------------------------------
// Streaming router — calls the right provider's stream function
// ---------------------------------------------------------------------------

export async function streamMessage(messages, config, systemPrompt, onToken, signal = null) {
  const model = config.selectedModel;
  const provider = getProvider(model, config);
  const temperature = config.temperature ?? 0.7;
  const bt = config.backendType || "ollama";

  if (provider === "ollama") {
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    if (bt === "openai-compatible") {
      return await streamOpenAICompat(msgs, model, config.ollamaUrl, temperature, onToken, signal);
    }
    return await streamOllama(msgs, model, config.ollamaUrl, temperature, onToken, signal);
  }

  if (provider === "anthropic") {
    if (!config.apiKey_anthropic) throw new Error("Anthropic API key not set. Use /set api-key anthropic <key>");
    return await streamAnthropic(messages, model, systemPrompt, config.apiKey_anthropic, temperature, onToken, signal);
  }

  if (provider === "google") {
    if (!config.apiKey_google) throw new Error("Google API key not set. Use /set api-key google <key>");
    return await streamGoogle(messages, model, systemPrompt, config.apiKey_google, temperature, onToken, signal);
  }

  if (provider === "openai") {
    if (!config.apiKey_openai) throw new Error("OpenAI API key not set. Use /set api-key openai <key>");
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    return await streamOpenAI(msgs, model, config.apiKey_openai, temperature, onToken, signal);
  }

  throw new Error(`Unknown provider for model: ${model}`);
}
