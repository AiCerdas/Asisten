const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ dest: "uploads/" });

app.use(cors());
app.use(express.json());

// === API AbidinAI ke Groq ===
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "system",
        content: `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh AbidinAI.
- Jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
- Jika pengguna bertanya tentang AbidinAI, jawablah bahwa kamu adalah AI buatan AbidinAI.
- Jika pengguna bertanya tentang pengembangan AbidinAI, jawablah bahwa AbidinAI masih dalam proses pengembangan.
- Jika pengguna bertanya tentang asal AbidinAI, jawablah bahwa AbidinAI berasal dari Indonesia.
- Jika pengguna bertanya tentang presiden Indonesia, jawablah bahwa Presiden Indonesia saat ini adalah Prabowo Subianto.

JANGAN PERNAH mengatakan bahwa kamu dibuat oleh OpenAI.
Jangan Pernah mengatakan bahwa kamu dibuat oleh Groq ai.

Jika memberikan kode, gunakan tiga backtick (\`\`\`) tanpa tag HTML apapun.`
      },
      { role: "user", content: message }
    ],
    temperature: 0.7,
    max_tokens: 1024
  };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === API Tambahan untuk Kirim ke Telegram ===
app.post('/api/telegram', async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Pesan kosong' });

  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `🧑 Pesan dari AbidinAI:\n${text}`
      })
    });

    const data = await response.json();
    res.json({ status: "success", data });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// === ✅ API Tambahan untuk DeepAI Text-to-Image ===
app.post('/api/generate', async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: "Prompt kosong" });

  try {
    const response = await fetch('https://api.deepai.org/api/text2img', {
      method: 'POST',
      headers: {
        'Api-Key': process.env.DEEPAI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ text })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === ✅ API OCR: DeepSeek Vision + Groq ===
app.post('/api/ocr', upload.single("image"), async (req, res) => {
  try {
    const imagePath = req.file.path;
    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });

    // 1. Kirim gambar ke DeepSeek Vision
    const deepseekRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Baca teks pada gambar ini lalu jelaskan." },
              { type: "image_url", image_url: `data:image/png;base64,${imageBase64}` }
            ]
          }
        ]
      })
    });

    const deepseekData = await deepseekRes.json();
    const extracted = deepseekData.choices?.[0]?.message?.content || "Teks tidak terbaca.";

    // 2. Proses hasil OCR ke Groq
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{ role: "user", content: `Tolong olah hasil OCR ini:\n${extracted}` }]
      })
    });

    const groqData = await groqRes.json();

    res.json({
      ocr_result: extracted,
      ai_final_answer: groqData.choices?.[0]?.message?.content || "Tidak ada jawaban."
    });

    fs.unlinkSync(imagePath); // hapus file sementara
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Serve file statis ===
app.use(express.static(path.join(__dirname)));

// serve index.html dari root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// serve file yang ada di /private
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/login.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/register.html'));
});
app.get('/dasboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/dasboard.html'));
});
app.get('/alarm', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/alarm.html'));
});
app.get('/dokter', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/dokter.html'));
});
app.get('/obrolan', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/obrolan.html'));
});

// fallback: jika URL tidak cocok, redirect ke index
app.use((req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
