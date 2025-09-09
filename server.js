const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// Load environment variables - penting untuk Vercel
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi multer untuk Vercel (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 4 * 1024 * 1024, // 4MB limit (Vercel limit adalah 4.5MB)
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files - path yang benar untuk Vercel
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html', 'htm'],
}));

// === API AbidinAI ke Groq ===
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    }

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
      console.error("Groq API error:", response.status, errorText);
      return res.status(500).json({ error: "Terjadi kesalahan pada server AI" });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    res.json({ reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Terjadi kesalahan internal server" });
  }
});

// === API Tambahan untuk Kirim ke Telegram ===
app.post('/api/telegram', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: 'Pesan kosong' });

    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ error: 'Konfigurasi Telegram tidak lengkap' });
    }

    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

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
    console.error("Telegram error:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
});

// === API Tambahan untuk DeepAI Text-to-Image ===
app.post('/api/generate', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) return res.status(400).json({ error: "Prompt kosong" });

    const DEEPAI_API_KEY = process.env.DEEPAI_API_KEY;
    if (!DEEPAI_API_KEY) {
      return res.status(500).json({ error: "Konfigurasi DeepAI tidak lengkap" });
    }

    const response = await fetch('https://api.deepai.org/api/text2img', {
      method: 'POST',
      headers: {
        'Api-Key': DEEPAI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ text })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("DeepAI error:", error);
    res.status(500).json({ error: error.message });
  }
});

// === 🚀 API OCR Vision: Upload gambar → OCR DeepSeek → Jawaban Groq ===
app.post('/api/vision', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: "Gambar kosong" 
      });
    }

    // Validasi ukuran file
    if (req.file.size > 4 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: "Ukuran file terlalu besar. Maksimal 4MB."
      });
    }

    // 1. Konversi buffer ke base64
    const imageBase64 = req.file.buffer.toString('base64');
    
    // 2. OCR pakai DeepSeek
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Konfigurasi DeepSeek tidak lengkap"
      });
    }

    const dsRes = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { 
            role: "user", 
            content: [
              { 
                type: "text", 
                text: "Extract all text from this image accurately. Return only the extracted text without any additional commentary." 
              },
              { 
                type: "image_url", 
                image_url: { 
                  url: `data:${req.file.mimetype};base64,${imageBase64}` 
                }
              }
            ]
          }
        ]
      })
    });
    
    if (!dsRes.ok) {
      const errorText = await dsRes.text();
      console.error("DeepSeek API error:", dsRes.status, errorText);
      return res.status(500).json({ 
        success: false,
        error: `DeepSeek API error: ${dsRes.status}` 
      });
    }
    
    const dsData = await dsRes.json();
    const ocrText = dsData.choices?.[0]?.message?.content || "";

    // 3. Kirim hasil OCR ke Groq buat dijelaskan
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Konfigurasi Groq tidak lengkap"
      });
    }

    const gqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          { 
            role: "system", 
            content: "Anda adalah asisten yang membantu menjelaskan teks yang diekstrak dari gambar. Berikan penjelasan yang jelas dan mudah dipahami dalam bahasa Indonesia." 
          },
          { 
            role: "user", 
            content: `Saya telah mengekstrak teks berikut dari gambar:\n\n"${ocrText}"\n\nBantu saya memahami isi teks ini dengan memberikan penjelasan yang jelas.` 
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
        success: false,
        error: `Groq API error: ${gqRes.status}` 
      });
    }
    
    const gqData = await gqRes.json();
    const explanation = gqData.choices?.[0]?.message?.content || "Tidak dapat memberikan penjelasan.";

    res.json({ 
      success: true,
      ocrText: ocrText,
      explanation: explanation
    });

  } catch (err) {
    console.error("OCR Error:", err);
    res.status(500).json({ 
      success: false,
      error: err.message || "Terjadi kesalahan saat memproses gambar" 
    });
  }
});

// Serve HTML pages
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

// Health check endpoint untuk Vercel
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Handle all other routes - penting untuk SPA di Vercel
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false,
    error: 'Terjadi kesalahan internal server' 
  });
});

// Start server hanya di development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 AbidinAI Server jalan di port ${PORT}`);
  });
}

// Export untuk Vercel (wajib untuk serverless functions)
module.exports = app;
