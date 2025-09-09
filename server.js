const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// === Konfigurasi Multer untuk upload gambar ===
const upload = multer({ dest: 'uploads/' });

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

// === ✅ Tambahan API Vision (Upload Gambar + Jawaban AI) ===
app.post('/api/vision', upload.single('image'), async (req, res) => {
  try {
    const filePath = req.file.path;
    const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    // Hapus file setelah dibaca (supaya tidak numpuk di server)
    fs.unlinkSync(filePath);

    const body = {
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "system",
          content: "Kamu adalah AbidinAI Vision, bantu analisa gambar yang diberikan user."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Tolong analisa gambar ini." },
            { type: "image_url", image_url: `data:image/jpeg;base64,${imageBase64}` }
          ]
        }
      ],
      max_tokens: 500
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan dari Vision.";
    res.json({ reply });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === API Telegram ===
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

// === ✅ DeepAI Text-to-Image ===
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

// === Serve file statis ===
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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

// fallback: jika URL tidak cocok
app.use((req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));