const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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

// === Serve file statis ===
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/dasboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dasboard.html'));
});

app.get('/dokter', (req, res) => {
  res.sendFile(path.join(__dirname, 'dokter.html'));
});

app.get('/alarm', (req, res) => {
  res.sendFile(path.join(__dirname, 'alarm.html'));
});

app.get('/obrolan', (req, res) => {
  res.sendFile(path.join(__dirname, 'obrolan.html'));
});

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));