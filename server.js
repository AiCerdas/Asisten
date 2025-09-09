const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer'); // untuk upload gambar
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    res.json({ reply });
  } catch (error) {
    console.error("Error in /api/chat:", error);
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

// === 🚀 API OCR Vision: Upload gambar → OCR DeepSeek → Jawaban Groq ===
app.post('/api/vision', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tidak ada gambar yang diunggah" });
  }

  try {
    // 1. OCR menggunakan DeepSeek Vision
    const formData = new FormData();
    formData.append('image', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    
    const dsRes = await fetch("https://api.deepseek.com/v1/ocr", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!dsRes.ok) {
      const errorText = await dsRes.text();
      console.error("DeepSeek OCR API error:", dsRes.status, errorText);
      return res.status(500).json({ 
        error: `DeepSeek API error: ${dsRes.status} - ${errorText}` 
      });
    }

    const dsData = await dsRes.json();
    const ocrText = dsData.text || dsData.result || "";

    if (!ocrText || ocrText.trim() === "") {
      return res.json({
        success: true,
        ocrText: "Tidak ada teks yang terdeteksi dalam gambar",
        explanation: "Saya tidak dapat menemukan teks yang dapat dibaca dalam gambar ini."
      });
    }

    // 2. Kirim hasil OCR ke Groq untuk dijelaskan
    const gqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { 
            role: "system", 
            content: `Anda adalah asisten AI yang membantu menjelaskan isi teks dari gambar. 
            Berikan penjelasan yang jelas, mudah dipahami, dan ramah dalam bahasa Indonesia.
            Jika teks berisi kode pemrograman, analisis dan berikan penjelasan tentang kode tersebut.
            Jika teks berisi bahasa asing, terjemahkan dan jelaskan.` 
          },
          { 
            role: "user", 
            content: `Saya telah mengekstrak teks berikut dari sebuah gambar:\n\n"${ocrText}"\n\n
            Tolong jelaskan isi teks ini dengan bahasa yang sederhana dan mudah dimengerti. 
            Berikan analisis singkat tentang apa yang dibahas dalam teks tersebut.` 
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!gqRes.ok) {
      const errorText = await gqRes.text();
      console.error("Groq API error:", gqRes.status, errorText);
      return res.status(500).json({ 
        error: `Groq API error: ${gqRes.status} - ${errorText}` 
      });
    }

    const gqData = await gqRes.json();
    const explanation = gqData.choices?.[0]?.message?.content || "Tidak dapat memberikan penjelasan.";

    res.json({ 
      success: true,
      ocrText, 
      explanation 
    });

  } catch (err) {
    console.error("Error in /api/vision:", err);
    res.status(500).json({ 
      error: "Terjadi kesalahan internal server",
      details: err.message 
    });
  }
});

// Endpoint alternatif untuk OCR dengan base64
app.post('/api/vision-base64', async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: "Tidak ada gambar yang dikirim" });
  }

  try {
    // 1. OCR menggunakan DeepSeek Vision dengan base64
    const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
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
              { type: "text", text: "Extract all text from this image accurately and completely." },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    if (!dsRes.ok) {
      const errorText = await dsRes.text();
      console.error("DeepSeek Vision API error:", dsRes.status, errorText);
      return res.status(500).json({ 
        error: `DeepSeek Vision API error: ${dsRes.status}` 
      });
    }

    const dsData = await dsRes.json();
    const ocrText = dsData.choices?.[0]?.message?.content || "";

    // 2. Kirim hasil OCR ke Groq untuk dijelaskan
    const gqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { 
            role: "system", 
            content: "Jelaskan isi teks hasil OCR dengan bahasa Indonesia yang sederhana dan mudah dipahami." 
          },
          { 
            role: "user", 
            content: `Ini adalah teks yang diekstrak dari gambar:\n\n${ocrText}\n\nJelaskan isinya dengan jelas.` 
          }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const gqData = await gqRes.json();
    const explanation = gqData.choices?.[0]?.message?.content || "Tidak ada penjelasan.";

    res.json({ 
      success: true,
      ocrText, 
      explanation 
    });

  } catch (err) {
    console.error("Error in /api/vision-base64:", err);
    res.status(500).json({ 
      error: "Terjadi kesalahan internal server",
      details: err.message 
    });
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// fallback: jika URL tidak cocok, redirect ke index
app.use((req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
