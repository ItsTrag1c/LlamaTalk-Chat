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
