const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Multer
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Inisialisasi GoogleGenerativeAI (hanya untuk /api/ocr)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Tidak diperlukan di sini

// Fungsi utilitas (dibiarkan jika API OCR digunakan)
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

// ==========================================================
// 🚀 ENDPOINT UTAMA YANG DIPERBAIKI TOTAL: /api/chat (Groq AI) 🚀
// ==========================================================
app.post('/api/chat', async (req, res) => {
  const { message, system_prompt } = req.body;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  
  if (!GROQ_API_KEY) {
      console.error("GROQ_API_KEY tidak ditemukan di .env!");
      return res.status(500).json({ reply: "Error Server: GROQ_API_KEY belum dikonfigurasi. Mohon cek file .env." });
  }

  let finalSystemPrompt = system_prompt;
  let groqModel = "llama3-8b-8192"; // Default Model (cocok untuk Kreator)
  let temperature = 0.8; // Default Temperature (cocok untuk Kreator)

  // LOGIKA DETEKSI MODE:
  // 1. MODE KREATOR (Menggunakan prompt yang dikirim dari creator.html)
  if (finalSystemPrompt && finalSystemPrompt.toLowerCase().includes("konten kreator")) {
      // Creator.html mengirim prompt panjang, kita gunakan setelan default Kreator di atas.
      // finalSystemPrompt tetap menggunakan prompt dari HTML.
      groqModel = "llama3-8b-8192";
      temperature = 0.8;
      
  } 
  // 2. MODE TERJEMAHAN (Asumsi Translate.html)
  else if (finalSystemPrompt && finalSystemPrompt.toLowerCase().includes("penerjemah") || finalSystemPrompt.toLowerCase().includes("translate")) {
      // Setelan untuk akurasi terjemahan
      finalSystemPrompt = "Anda adalah penerjemah profesional. Jawablah permintaan pengguna dengan akurat dan singkat. Berikan HANYA teks terjemahan yang diminta tanpa tambahan apapun.";
      temperature = 0.1; 
      groqModel = "mixtral-8x7b-32768"; 
      
  } 
  // 3. MODE DEFAULT (Obrolan umum / obrolanfull.html)
  else {
      // Setelan untuk obrolan umum/default AbidinAI
      finalSystemPrompt = `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh Abidin. Jawab dengan ramah dan informatif. Jangan pernah menyebut OpenAI atau Groq.`;
      groqModel = "llama3-8b-8192";
      temperature = 0.7;
  }
  
  // Pastikan finalSystemPrompt ada (jika ada masalah pengiriman dari front-end)
  if (!finalSystemPrompt) {
       finalSystemPrompt = `Anda adalah chatbot. Jawab pertanyaan pengguna.`;
  }

  const messages = [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: message }
  ];

  const body = {
    model: groqModel,
    messages: messages,
    temperature: temperature,
    max_tokens: 2048 // Menaikkan token maksimal untuk fleksibilitas
  };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    // Penanganan error dari Groq API
    if (data.error) {
        console.error(`Groq API returned an error for model ${groqModel}:`, data.error);
        return res.status(500).json({ reply: `Error dari Groq: ${data.error.message || 'Kesalahan API Groq tidak diketahui.'}` });
    }
    
    const reply = data.choices?.[0]?.message?.content;
    
    if (!reply) {
        console.warn(`Groq did not return a reply. Full data:`, data);
        return res.status(500).json({ reply: "Maaf, Groq tidak memberikan balasan yang valid. Cek log server." });
    }
    
    res.json({ reply });
    
  } catch (error) {
    console.error("Kesalahan Jaringan/Server:", error);
    res.status(500).json({ reply: `Terjadi kesalahan jaringan pada server: ${error.message}` });
  }
});


// --- API Tambahan untuk Kirim ke Telegram (Tetap Sama) ---
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

// --- API OCR dan Analisis (Tetap Sama) ---
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!req.file) {
    return res.status(400).json({ error: 'File gambar tidak ditemukan' });
  }

  // PROMPT CANGGIH ABIDINAI UNTUK ANALISIS MULTIMODAL
  const abidinaiPrompt = `
    Anda adalah ABIDINAI: Analis Multimodal Kontekstual Strategis. Tugas Anda adalah menganalisis input gambar yang diberikan.
    IKUTI ALUR PENALARAN WAJIB DIIKUTI:
    ... (Prompt dipersingkat untuk brevity) ...
    [Proyeksi & Rekomendasi Lanjutan]: (Kesimpulan berbasis penalaran canggih, Proyeksi Skenario Terdekat, serta saran proaktif.)
    `;

  // Mengubah buffer gambar menjadi base64
  const imageBase64 = req.file.buffer.toString('base64');
  const imageMimeType = req.file.mimetype;

  const payload = {
    contents: [
      {
        parts: [
          { text: abidinaiPrompt },
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

// --- API untuk fitur Riset Mendalam (Tetap Sama) ---
app.post('/api/research', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query tidak ditemukan' });

  let results = { wikipedia: {}, openalex: {} };
  // ... (kode pencarian Wikipedia dan OpenAlex) ...
  // Dibiarkan tanpa perubahan karena tidak terkait dengan Groq chat
  
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
    const openAlexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}`;
    const openAlexRes = await fetch(openAlexUrl);
    const openAlexData = await openAlexRes.json();
    if (openAlexData.results && openAlexData.results.length > 0) {
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

// --- API Obrolan Sepuasnya dengan Groq (Tetap Sama) ---
app.post('/api/unlimited-chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Pesan kosong' });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
      return res.status(500).json({ reply: "Error Server: GROQ_API_KEY belum dikonfigurasi." });
  }

  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct", 
    messages: [
      {
        role: "system",
        content: "Anda adalah AbidinAI, asisten cerdas yang ramah dan informatif. Tanggapi permintaan pengguna secara mendalam dan komprehensif tanpa batasan token."
      },
      { role: "user", content: message }
    ],
    temperature: 0.7,
  };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
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


// --- Serve file statis (Tetap Sama) ---
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'private/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'private/register.html')));
app.get('/dasboard', (req, res) => res.sendFile(path.join(__dirname, 'private/dasboard.html')));
app.get('/alarm', (req, res) => res.sendFile(path.join(__dirname, 'private/alarm.html')));
app.get('/dokter', (req, res) => res.sendFile(path.join(__dirname, 'private/dokter.html')));
app.get('/obrolan', (req, res) => res.sendFile(path.join(__dirname, 'private/obrolan.html')));
app.get('/obrolanfull', (req, res) => res.sendFile(path.join(__dirname, 'private/obrolanfull.html')));
app.get('/Translate', (req, res) => res.sendFile(path.join(__dirname, 'private/Translate.html')));
app.get('/creator', (req, res) => res.sendFile(path.join(__dirname, 'private/creator.html')));
// fallback
app.use((req, res) => res.redirect('/'));

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
