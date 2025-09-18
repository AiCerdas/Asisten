const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const { HfInference } = require('@huggingface/inference');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Multer untuk menyimpan file di memori
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// --- API Groq untuk Chat (Tetap sama) ---
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

// --- API Tambahan untuk Kirim ke Telegram ---
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

// --- API OCR dan Analisis (Diperbarui) ---
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!req.file) {
    return res.status(400).json({ error: 'File gambar tidak ditemukan' });
  }

  // Mengubah buffer gambar menjadi base64
  const imageBase64 = req.file.buffer.toString('base64');
  const imageMimeType = req.file.mimetype;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: "Lihat gambar ini. Jawablah pertanyaan dari gambar ini dengan akurat, atau jelaskan isinya. Berikan jawaban yang relevan dan mudah dipahami."
          },
          {
            inline_data: {
              mime_type: imageMimeType,
              data: imageBase64,
            },
          },
        ]
      }
    ]
  };

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const geminiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memahami isi gambar ini. Mohon coba lagi dengan gambar yang lebih jelas.";
    
    res.json({ reply: geminiReply });
  } catch (error) {
    console.error("Kesalahan Analisis Gambar:", error);
    res.status(500).json({ error: 'Gagal menganalisis gambar', details: error.message });
  }
});

// --- API untuk fitur Riset Mendalam ---
app.post('/api/research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query tidak ditemukan' });

  let results = { wikipedia: {}, openalex: {} };

  // --- Cari di Wikipedia ---
  try {
    const wikiUrl = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const wikiRes = await fetch(wikiUrl);
    const wikiData = await wikiRes.json();
    if (wikiData.title && wikiData.type !== 'disambiguation') {
      results.wikipedia = {
        title: wikiData.title,
        extract: wikiData.extract,
        link: wikiData.content_urls.desktop.page
      };
    } else {
      results.wikipedia.message = "Tidak ada hasil yang jelas dari Wikipedia.";
    }
  } catch (error) {
    results.wikipedia.message = `Gagal mencari di Wikipedia: ${error.message}`;
  }

  // --- Cari di OpenAlex ---
  try {
    // URL OpenAlex untuk mencari works (artikel, buku, dll)
    const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}`;
    const openAlexRes = await fetch(openAlexUrl);
    const openAlexData = await openAlexRes.json();
    if (openAlexData.results && openAlexData.results.length > 0) {
      // Ambil 3 hasil teratas
      const topResults = openAlexData.results.slice(0, 3).map(item => ({
        title: item.title,
        abstract: item.abstract_inverted_index ? Object.values(item.abstract_inverted_index).flat().join(' ').replace(/_i/g, '') : "Tidak ada abstrak",
        doi: item.doi,
        publication_date: item.publication_date
      }));
      results.openalex = topResults;
    } else {
      results.openalex.message = "Tidak ada hasil yang relevan dari OpenAlex.";
    }
  } catch (error) {
    results.openalex.message = `Gagal mencari di OpenAlex: ${error.message}`;
  }

  res.json(results);
});

// --- API Obrolan Sepuasnya dengan Groq (Tidak membatasi `max_tokens`) ---
app.post('/api/unlimited-chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Pesan kosong' });

  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct", // Anda bisa gunakan model Groq lainnya
    messages: [
      {
        role: "system",
        content: "Anda adalah AbidinAI, asisten cerdas yang ramah dan informatif. Tanggapi permintaan pengguna secara mendalam dan komprehensif tanpa batasan token."
      },
      { role: "user", content: message }
    ],
    temperature: 0.7,
    // Di sini kita tidak menyertakan max_tokens untuk memungkinkan respons yang lebih panjang.
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
    const reply = data.choices?.[0]?.message?.content || "Maaf, saya tidak bisa memberikan balasan saat ini.";
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API BARU untuk Membuat Gambar dengan Hugging Face (DIPERBAIKI) ---
app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: 'Prompt teks tidak ditemukan' });
  }

  const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY; 
  const HUGGINGFACE_API_URL = "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev";

  if (!HUGGINGFACE_API_KEY) {
    return res.status(500).json({ error: 'HUGGINGFACE_API_KEY tidak dikonfigurasi' });
  }

  try {
    const response = await fetch(HUGGINGFACE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HUGGINGFACE_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    if (!response.ok) {
        throw new Error(`Kesalahan API Hugging Face: ${response.status} ${response.statusText}`);
    }

    const imageArrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(imageArrayBuffer);
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(imageBuffer);

  } catch (error) {
    console.error("Kesalahan pembuatan gambar:", error);
    res.status(500).json({ error: 'Gagal membuat gambar', details: error.message });
  }
});

// --- Serve file statis (Tetap sama) ---
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'private/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'private/register.html')));
app.get('/dasboard', (req, res) => res.sendFile(path.join(__dirname, 'private/dasboard.html')));
app.get('/alarm', (req, res) => res.sendFile(path.join(__dirname, 'private/alarm.html')));
app.get('/dokter', (req, res) => res.sendFile(path.join(__dirname, 'private/dokter.html')));
app.get('/obrolan', (req, res) => res.sendFile(path.join(__dirname, 'private/obrolan.html')));
app.get('/obrolanfull', (req, res) => res.sendFile(path.join(__dirname, 'private/obrolanfull.html')));

// fallback
app.use((req, res) => res.redirect('/'));

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
