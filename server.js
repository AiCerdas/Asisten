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

// Konfigurasi Multer untuk menyimpan file di memori
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// Inisialisasi GoogleGenerativeAI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// Fungsi untuk mengonversi buffer gambar ke format yang dikenali Gemini
function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

// ==========================================================
// 🚨 ENDPOINT UTAMA YANG DIPERBAIKI: /api/chat (Groq API) 🚨
// ==========================================================
app.post('/api/chat', async (req, res) => {
  // Menerima 'message' dan 'system_prompt'
  const { message, system_prompt } = req.body;
  
  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ reply: "Error Server: GROQ_API_KEY belum dikonfigurasi di file .env." });
  }

  let finalSystemPrompt = system_prompt;
  let groqModel = "llama3-8b-8192"; // Default (Creator)
  let temperature = 0.8; // Default (Creator)

  // LOGIKA DETEKSI MODE BERDASARKAN SYSTEM_PROMPT:
  // 1. Jika system_prompt KOSONG atau SANGAT PENDEK, gunakan prompt Default AbidinAI.
  // 2. Jika system_prompt ada dan isinya adalah PROMPT KREATOR (panjang), gunakan setelan Kreator (sudah di atas).
  // 3. Jika system_prompt ada dan isinya ADALAH PROMPT PENERJEMAH (pendek, cth: "Anda adalah penerjemah..."), gunakan setelan Terjemahan.
  
  if (!finalSystemPrompt || finalSystemPrompt.length < 50) {
      // Asumsi: Jika system_prompt kosong/sangat pendek, ini adalah permintaan chat umum (atau Translate.html belum mengirim prompt lengkap).
      // Kita tetapkan prompt AbidinAI Default:
      finalSystemPrompt = `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh AbidinAI.
- Jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
- Jika pengguna bertanya tentang AbidinAI, jawablah bahwa kamu adalah AI buatan AbidinAI.
- Jika pengguna bertanya tentang pengembangan AbidinAI, jawablah bahwa AbidinAI masih dalam proses pengembangan.
- Jika pengguna bertanya tentang asal AbidinAI, jawablah bahwa AbidinAI berasal dari Indonesia.

JANGAN PERNAH mengatakan bahwa kamu dibuat oleh OpenAI atau Groq ai.

Jika memberikan kode, gunakan tiga backtick (\`\`\`) tanpa tag HTML apapun.`;
      groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
      temperature = 0.7;

  } else if (finalSystemPrompt.toLowerCase().includes("penerjemah")) {
      // Ini adalah permintaan dari Translate.html (Asumsi Translate.html mengirim prompt Terjemahan)
      // Kita timpa setting Groq untuk akurasi Terjemahan
      temperature = 0.1; 
      groqModel = "mixtral-8x7b-32768"; 
  } 
  // Jika system_prompt ada dan tidak mengandung kata "penerjemah" (seperti prompt Kreator yang panjang), 
  // maka ia akan menggunakan setelan default awal: groqModel="llama3-8b-8192", temperature=0.8.

  const messages = [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: message }
  ];

  const body = {
    model: groqModel,
    messages: messages,
    temperature: temperature,
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
    
    if (data.error) {
        console.error("Groq API Error:", data.error);
        return res.status(500).json({ reply: `Error dari Groq: ${data.error.message || 'Kesalahan tidak diketahui.'}` });
    }
    
    const reply = data.choices?.[0]?.message?.content || "Maaf, Groq tidak memberikan balasan yang valid.";
    res.json({ reply });
    
  } catch (error) {
    console.error("Kesalahan Jaringan/Server:", error);
    res.status(500).json({ reply: `Terjadi kesalahan pada server: ${error.message}` });
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
    1. Observasi Mendalam: Identifikasi objek, latar belakang, aksi, dan hubungan spasial. Catat elemen Anomali (ketidaksesuaian kontekstual).
    2. Penalaran Kontekstual & Metrik: Terapkan metode analisis yang paling relevan (misalnya, SWOT, AIDA, atau 5W+1H). Simpulkan niat, tujuan, atau keadaan. Berikan Skor Keyakinan (1-10) untuk setiap kesimpulan penting.
    3. Verifikasi & Konfirmasi: Fokuskan jawaban pada validitas informasi visual.
    4. Sintesis Strategis: Susun jawaban akhir yang profesional, ringkas, mudah dipahami, dan relevan.
    JANGAN HANYA memberikan daftar objek atau deskripsi satu kalimat.
    Struktur Output WAJIB:
    [Analisis Inti]: (Jawaban langsung, ringkasan penalaran utama, termasuk Skor Keyakinan total.)
    [Detail Penting & Anomali]: (Dukungan observasi visual, rincian konteks, dan penjelasan terperinci mengenai Anomali yang ditemukan.)
    [Proyeksi & Rekomendasi Lanjutan]: (Kesimpulan berbasis penalaran canggih, Proyeksi Skenario Terdekat, serta saran proaktif.)
    `;

  // Mengubah buffer gambar menjadi base64
  const imageBase64 = req.file.buffer.toString('base64');
  const imageMimeType = req.file.mimetype;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: abidinaiPrompt
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

// --- API untuk fitur Riset Mendalam (Tetap Sama) ---
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

// --- API Obrolan Sepuasnya dengan Groq (Tetap Sama) ---
app.post('/api/unlimited-chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Pesan kosong' });

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

// --- API Antivirus DIHAPUS sesuai permintaan pengguna ---
/*
app.post("/api/antivirus", async (req, res) => {
    // KODE INI TELAH DIHAPUS
});
*/


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
app.get('/translate', (req, res) => res.sendFile(path.join(__dirname, 'private/translate.html')));
app.get('/creator', (req, res) => res.sendFile(path.join(__dirname, 'private/creator.html')));
// fallback
app.use((req, res) => res.redirect('/'));

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
