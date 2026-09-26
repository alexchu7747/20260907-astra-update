const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "public");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, limit = 120000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error("文本太长，请分段朗读"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("请求格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

async function handleHuaweiAi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const key = process.env.HUAWEI_MAAS_API_KEY;
  if (!key) {
    sendJson(res, 400, { error: "本地服务未配置 HUAWEI_MAAS_API_KEY" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const prompt = String(body.prompt || "").trim();
    if (!prompt) {
      sendJson(res, 400, { error: "提示词为空" });
      return;
    }

    const endpoint = process.env.HUAWEI_MAAS_ENDPOINT || "https://api.modelarts-maas.com/v2/chat/completions";
    const model = process.env.HUAWEI_MAAS_MODEL || String(body.model || "glm-5.3").trim();
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "你是严谨的葡萄牙语学习助手。严格遵循用户要求，不补充未经提供的事实。" },
          { role: "user", content: prompt }
        ],
        temperature: Number(body.temperature ?? 0.2),
        max_tokens: Math.min(8000, Math.max(64, Number(body.maxTokens) || 1200))
      })
    });

    if (!upstream.ok) {
      const message = await upstream.text();
      sendJson(res, upstream.status, { error: message.slice(0, 500) || "华为云 MaaS 请求失败" });
      return;
    }

    const data = await upstream.json();
    sendJson(res, 200, { text: data?.choices?.[0]?.message?.content || "", usage: data?.usage || null });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "华为云 MaaS 调用失败" });
  }
}

async function handleElevenLabsTts(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const key = process.env.ELEVENLABS_API_KEY || req.headers["x-elevenlabs-key"];
  if (!key) {
    sendJson(res, 400, { error: "缺少 ELEVENLABS_API_KEY" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const text = String(body.text || "").trim();
    const voiceId = String(body.voiceId || "21m00Tcm4TlvDq8ikWAM").trim();
    const modelId = String(body.modelId || "eleven_multilingual_v2").trim();
    if (!text) {
      sendJson(res, 400, { error: "文本为空" });
      return;
    }

    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": key
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: Number(body.stability ?? 0.44),
          similarity_boost: Number(body.similarityBoost ?? 0.78),
          style: Number(body.style ?? 0.25),
          use_speaker_boost: body.speakerBoost !== false
        }
      })
    });

    if (!upstream.ok) {
      const message = await upstream.text();
      sendJson(res, upstream.status, { error: message.slice(0, 300) || "ElevenLabs 请求失败" });
      return;
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": upstream.headers.get("content-type") || "audio/mpeg",
      "Cache-Control": "no-store"
    });
    res.end(audio);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "高质量朗读失败" });
  }
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  if (requestPath === "/api/ai/chat") {
    handleHuaweiAi(req, res);
    return;
  }
  if (requestPath === "/api/tts/elevenlabs") {
    handleElevenLabsTts(req, res);
    return;
  }

  let filePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  filePath = path.join(root, filePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    res.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`葡语学习工具已启动：${url}`);
});
