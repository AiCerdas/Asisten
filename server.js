const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi multer untuk upload file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Hanya izinkan file gambar
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diizinkan!'), false);
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware untuk logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// === API AbidinAI ke Groq ===
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    }

    const body = {
      model: "llama-3.1-8b-instant",
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
        { role: "user", content: message.trim() }
      ],
      temperature: 0.7,
      max_tokens: 1024,
      stream: false
    };

    console.log('Mengirim request ke Groq API...');
    
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
      console.error('Groq API error:', response.status, errorText);
      return res.status(500).json({ 
        error: `Error dari Groq API: ${response.status}`,
        details: 'Silakan coba lagi nanti'
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "Maaf, tidak ada balasan.";
    
    res.json({ 
      success: true,
      reply 
    });

  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ 
      error: "Terjadi kesalahan internal server",
      details: error.message 
    });
  }
});

// === API Tambahan untuk Kirim ke Telegram ===
app.post('/api/telegram', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: 'Pesan tidak boleh kosong' });
    }

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
    
    if (!data.ok) {
      throw new Error(data.description || 'Error mengirim pesan ke Telegram');
    }

    res.json({ 
      status: "success", 
      data 
    });

  } catch (error) {
    console.error("Error in /api/telegram:", error);
    res.status(500).json({ 
      status: "error", 
      message: error.message 
    });
  }
});

// === API Tambahan untuk DeepAI Text-to-Image ===
app.post('/api/generate', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim() === '') {
      return res.status(400).json({ error: "Prompt tidak boleh kosong" });
    }

    if (!process.env.DEEPAI_API_KEY) {
      return res.status(500).json({ error: "API key DeepAI tidak dikonfigurasi" });
    }

    const response = await fetch('https://api.deepai.org/api/text2img', {
      method: 'POST',
      headers: {
        'Api-Key': process.env.DEEPAI_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ text: text.trim() })
    });

    if (!response.ok) {
      throw new Error(`DeepAI API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error("Error in /api/generate:", error);
    res.status(500).json({ 
      error: "Terjadi kesalahan internal server",
      details: error.message 
    });
  }
});

// === API OCR Vision: Upload gambar → OCR → Jawaban AI ===
app.post('/api/vision', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: "Tidak ada gambar yang diunggah",
        details: "Silakan pilih file gambar terlebih dahulu"
      });
    }

    console.log('File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    // 1. Gunakan OCR Space sebagai fallback (gratis dan reliable)
    const OCR_SPACE_API_KEY = 'helloworld'; // API key gratis
    const formData = new FormData();
    formData.append('apikey', OCR_SPACE_API_KEY);
    formData.append('language', 'ind');
    formData.append('isOverlayRequired', 'false');
    formData.append('base64Image', `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`);
    formData.append('OCREngine', '2'); // Engine 2 lebih baik untuk teks umum

    console.log('Mengirim request ke OCR Space API...');
    
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    if (!ocrResponse.ok) {
      throw new Error(`OCR Space API error: ${ocrResponse.status}`);
    }

    const ocrData = await ocrResponse.json();
    
    if (ocrData.IsErroredOnProcessing) {
      throw new Error(ocrData.ErrorMessage || 'Error processing image');
    }

    let ocrText = '';
    if (ocrData.ParsedResults && ocrData.ParsedResults.length > 0) {
      ocrText = ocrData.ParsedResults[0].ParsedText || '';
    }

    if (!ocrText || ocrText.trim() === '') {
      return res.json({
        success: true,
        ocrText: "Tidak ada teks yang terdeteksi dalam gambar",
        explanation: "Saya tidak dapat menemukan teks yang dapat dibaca dalam gambar ini."
      });
    }

    console.log('OCR Text extracted:', ocrText.substring(0, 100) + '...');

    // 2. Kirim hasil OCR ke Groq untuk dijelaskan
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
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

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      throw new Error(`Groq API error: ${groqResponse.status} - ${errorText}`);
    }

    const groqData = await groqResponse.json();
    const explanation = groqData.choices?.[0]?.message?.content || "Tidak dapat memberikan penjelasan.";

    res.json({ 
      success: true,
      ocrText, 
      explanation 
    });

  } catch (error) {
    console.error("Error in /api/vision:", error);
    res.status(500).json({ 
      error: "Terjadi kesalahan dalam memproses gambar",
      details: error.message,
      suggestion: "Silakan coba dengan gambar yang lebih jelas atau format yang berbeda"
    });
  }
});

// === Serve file statis ===
app.use(express.static(path.join(__dirname)));

// Route untuk file HTML
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server AbidinAI berjalan dengan baik',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Test endpoint untuk debugging
app.get('/test', (req, res) => {
  res.json({
    message: 'Server berjalan dengan baik!',
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Terjadi kesalahan internal server',
    details: process.env.NODE_ENV === 'development' ? error.message : 'Silakan coba lagi nanti'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint tidak ditemukan',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AbidinAI Server berjalan di port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Test endpoint: http://localhost:${PORT}/test`);
});
