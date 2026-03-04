import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

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

export async function getRunningOllamaModels(url) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await fetchWithTimeout(`${base}/api/ps`, {}, 5_000);
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
  let looksOllama = false;
  try {
    const res = await fetchWithTimeout(`${base}/api/tags`, {}, 10_000);
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.models)) {
        looksOllama = true;
      }
    }
  } catch { /* try next */ }
  // If /api/tags looks valid, also probe /v1/models — if BOTH respond,
  // prefer openai-compatible (llama.cpp serves both but streams SSE).
  if (looksOllama) {
    try {
      const res = await fetchWithTimeout(`${base}/v1/models`, {}, 10_000);
      if (res.ok) return "openai-compatible";
    } catch { /* fall through to ollama */ }
    return "ollama";
  }
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
// Streaming HTTP request using Node.js http/https (reliable in pkg builds)
// ---------------------------------------------------------------------------

function streamRequest(url, options, signal = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqFn = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = reqFn(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      signal,
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res);
      } else {
        let body = "";
        res.on("data", (c) => body += c);
        res.on("end", () => reject(new Error(`HTTP ${res.statusCode}: ${body}`)));
        res.on("error", reject);
      }
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Line-buffered SSE/NDJSON parser for Node.js Readable streams
// ---------------------------------------------------------------------------

async function* streamLines(nodeStream) {
  let buf = "";
  for await (const chunk of nodeStream) {
    buf += chunk.toString();
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
  const res = await streamRequest(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, options: { temperature } }),
    },
    signal
  );
  let usage = null;
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    try {
      const obj = JSON.parse(line);
      if (obj.message?.content) onToken(obj.message.content);
      if (obj.done) {
        usage = {
          promptTokens: obj.prompt_eval_count || 0,
          outputTokens: obj.eval_count || 0,
          evalDurationNs: obj.eval_duration || null,
        };
        break;
      }
    } catch {
      // Fallback: llama.cpp may send SSE format (data: {...}) even on /api/chat
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const obj = JSON.parse(data);
          const token = obj.choices?.[0]?.delta?.content || obj.message?.content;
          if (token) onToken(token);
        } catch { /* skip */ }
      }
    }
  }
  return usage;
}

async function streamOpenAICompat(messages, model, url, temperature, onToken, signal) {
  validateOllamaUrl(url);
  const base = url.replace(/\/$/, "");
  const res = await streamRequest(
    `${base}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true, temperature, stream_options: { include_usage: true } }),
    },
    signal
  );
  let usage = null;
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const obj = JSON.parse(data);
      const token = obj.choices?.[0]?.delta?.content;
      if (token) onToken(token);
      if (obj.usage) {
        usage = {
          promptTokens: obj.usage.prompt_tokens || 0,
          outputTokens: obj.usage.completion_tokens || 0,
        };
      }
    } catch { /* skip */ }
  }
  return usage;
}

async function streamAnthropic(messages, model, systemText, apiKey, temperature, onToken, signal) {
  const reqBody = {
    model,
    max_tokens: 4096,
    messages: messages.filter((m) => m.role !== "system"),
    temperature,
    stream: true,
  };
  if (systemText) reqBody.system = systemText;

  const res = await streamRequest(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(reqBody),
    },
    signal
  );
  let usage = { promptTokens: 0, outputTokens: 0 };
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6));
      if (obj.type === "message_start" && obj.message?.usage) {
        usage.promptTokens = obj.message.usage.input_tokens || 0;
      }
      if (obj.type === "content_block_delta" && obj.delta?.text) {
        onToken(obj.delta.text);
      }
      if (obj.type === "message_delta" && obj.usage) {
        usage.outputTokens = obj.usage.output_tokens || 0;
      }
      if (obj.type === "message_stop") break;
    } catch { /* skip */ }
  }
  return usage;
}

async function streamGoogle(messages, model, systemText, apiKey, temperature, onToken, signal) {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const reqBody = { contents, generationConfig: { temperature } };
  if (systemText) reqBody.systemInstruction = { parts: [{ text: systemText }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await streamRequest(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    },
    signal
  );
  let usage = null;
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    try {
      const obj = JSON.parse(line.slice(6));
      const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) onToken(text);
      if (obj.usageMetadata) {
        usage = {
          promptTokens: obj.usageMetadata.promptTokenCount || 0,
          outputTokens: obj.usageMetadata.candidatesTokenCount || 0,
        };
      }
    } catch { /* skip */ }
  }
  return usage;
}

async function streamOpenAI(messages, model, apiKey, temperature, onToken, signal) {
  const res = await streamRequest(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature, stream: true, stream_options: { include_usage: true } }),
    },
    signal
  );
  let usage = null;
  for await (const line of streamLines(res)) {
    if (signal?.aborted) break;
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") break;
    try {
      const obj = JSON.parse(data);
      const token = obj.choices?.[0]?.delta?.content;
      if (token) onToken(token);
      if (obj.usage) {
        usage = {
          promptTokens: obj.usage.prompt_tokens || 0,
          outputTokens: obj.usage.completion_tokens || 0,
        };
      }
    } catch { /* skip */ }
  }
  return usage;
}

// ---------------------------------------------------------------------------
// Streaming router — calls the right provider's stream function
// ---------------------------------------------------------------------------

export async function streamMessage(messages, config, systemPrompt, onToken, signal = null) {
  const model = config.selectedModel;
  const provider = getProvider(model, config);
  const temperature = config.temperature ?? 0.7;
  let bt = config.backendType || "ollama";

  // Auto-detect backend if never explicitly set
  if (provider === "ollama" && !config.backendType) {
    try {
      const detected = await detectBackend(config.ollamaUrl);
      if (detected !== "unknown") {
        bt = detected;
        config.backendType = detected;
      }
    } catch { /* use default */ }
  }

  if (provider === "ollama") {
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    if (bt === "openai-compatible") {
      const usage = await streamOpenAICompat(msgs, model, config.ollamaUrl, temperature, onToken, signal);
      return { provider: "openai-compatible", usage };
    }
    const usage = await streamOllama(msgs, model, config.ollamaUrl, temperature, onToken, signal);
    return { provider: "ollama", usage };
  }

  if (provider === "anthropic") {
    if (!config.apiKey_anthropic) throw new Error("Anthropic API key not set. Use /set api-key anthropic <key>");
    const usage = await streamAnthropic(messages, model, systemPrompt, config.apiKey_anthropic, temperature, onToken, signal);
    return { provider: "anthropic", usage };
  }

  if (provider === "google") {
    if (!config.apiKey_google) throw new Error("Google API key not set. Use /set api-key google <key>");
    const usage = await streamGoogle(messages, model, systemPrompt, config.apiKey_google, temperature, onToken, signal);
    return { provider: "google", usage };
  }

  if (provider === "openai") {
    if (!config.apiKey_openai) throw new Error("OpenAI API key not set. Use /set api-key openai <key>");
    const msgs = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;
    const usage = await streamOpenAI(msgs, model, config.apiKey_openai, temperature, onToken, signal);
    return { provider: "openai", usage };
  }

  throw new Error(`Unknown provider for model: ${model}`);
}
