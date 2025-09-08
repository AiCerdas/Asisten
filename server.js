const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const Tesseract = require('tesseract.js');

const app = express();

app.use(cors());
app.use(express.json());

// === API AbidinAI ke Groq ===
app.post('/api/chat', async (req, res) => {
  const { pesan } = req.body;

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

JANGAN PERNAH mengatakan bahwa kamu dibuat oleh OpenAI. Jangan Pernah mengatakan bahwa kamu dibuat oleh Groq ai.  

Jika memberikan kode, gunakan tiga backtick (\`\`\`) tanpa tag HTML apapun.`
      },
      { role: "user", content: pesan }
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
    const balasan = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    res.json({ balasan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === API Tambahan untuk OCR (Upload gambar -> OCR -> Groq AI) ===
const upload = multer({ dest: "uploads/" });

app.post('/api/ocr', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Tidak ada gambar diupload" });

  try {
    // Jalankan OCR
    const result = await Tesseract.recognize(req.file.path, 'eng');
    const extractedText = result.data.text.trim() || "Tidak ada teks terbaca";

    // Kirim hasil OCR ke Groq
    const body = {
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        { role: "system", content: "Kamu adalah AbidinAI, bantu jelaskan isi teks dari gambar yang diupload user." },
        { role: "user", content: extractedText }
      ],
      temperature: 0.7,
      max_tokens: 512
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
    const balasan = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    res.json({ ocr_text: extractedText, balasan });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
        text: `📩 Pesan dari AbidinAI:\n${text}`
      })
    });

    const data = await response.json();
    res.json({ status: "berhasil", data });
  } catch (error) {
    res.status(500).json({ status: "gagal", error: error.message });
  }
});

// === ✅ API Tambahan untuk DeepAI Text-to-Image ===
app.post('/api/generate', async (req, res) => {
  const { teks } = req.body;

  if (!teks) return res.status(400).json({ error: "Prompt kosong" });

  try {
    const response = await fetch('https://api.deepai.org/api/text2img', {
      method: 'POST',
      headers: {
        'Api-Key': process.env.DEEPAI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ text: teks })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Sajikan static file ===
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
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'private/dashboard.html'));
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

// fallback redirect ke index
app.use((req, res) => {
  res.redirect('/');
});

// === Export untuk Vercel ===
module.exports = app;
