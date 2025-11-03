const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();
const path = require('path');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================================
// 1. KONFIGURASI EXPRESS & MULTER (Untuk Batas Ukuran Data)
// ==========================================================

// Atur batas ukuran body (untuk data JSON dan URL-encoded)
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true })); 
app.use(cors());

// Konfigurasi Multer untuk menyimpan di memori
const upload = multer({ 
    storage: multer.memoryStorage(),
    // Batas ukuran file: 10MB per file
    limits: { fileSize: 10 * 1024 * 1024 } 
});


// ==========================================================
// 2. INISIALISASI AI & UTILITY
// ==========================================================

// Inisialisasi Gemini (hanya jika API key tersedia)
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

// Fungsi konversi Buffer gambar ke format Gemini
function fileToGenerativePart(file) {
    return {
        inlineData: {
            data: file.buffer.toString("base64"),
            mimeType: file.mimetype
        },
    };
}

// ... (Sisipkan semua fungsi dan database Anda di sini, misalnya javaneseDB, aksaraKeLatin, dll.)
// ... (Saya anggap fungsi dan data tersebut sudah ada dan berfungsi)

// ==========================================================
// 3. 🚀 SEMUA ENDPOINT API DITEMPATKAN DI AWAL
// (Ini adalah KUNCI untuk mencegah error HTML)
// ==========================================================

// 🧪 Route Uji Kesehatan (PENTING untuk debugging deployment)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server berjalan dengan baik.',
        gemini_status: process.env.GEMINI_API_KEY ? 'Tersedia' : 'TIDAK TERSEDIA',
        groq_status: process.env.GROQ_API_KEY ? 'Tersedia' : 'TIDAK TERSEDIA'
    });
});


// 🚀 ENDPOINT OCR/MULTIMODAL (Hingga 5 Gambar)
app.post('/api/ocr', upload.array('images', 5), async (req, res) => {
    
    if (!process.env.GEMINI_API_KEY) {
        console.error("❌ GEMINI_API_KEY tidak ditemukan.");
        return res.status(503).json({ 
            error: 'Layanan Multimodal Tidak Tersedia', 
            details: 'GEMINI_API_KEY belum dikonfigurasi di server.' 
        });
    }

    // Penanganan error Multer (jika file terlalu besar atau format salah)
    if (req.multerError) {
        console.error("❌ Multer Error:", req.multerError);
        return res.status(400).json({ error: 'Gagal Upload File', details: req.multerError.message });
    }

    if (!req.files || req.files.length === 0) {
        console.log("❌ Error: Tidak ada file yang terdeteksi di req.files.");
        return res.status(400).json({ error: 'Minimal satu file gambar tidak ditemukan. Pastikan field name adalah "images".' });
    }
    
    // Konfirmasi penerimaan file (untuk debugging log)
    console.log(`✅ Multer berhasil menerima ${req.files.length} file.`);

    const abidinaiPrompt = `
        ANDA ADALAH: ABIDINAI — Analis Multimodal Kontekstual Strategis.
        Tugas Anda adalah menganalisis SEMUA gambar yang diberikan, memproses informasi yang relevan, dan merangkumnya.
        Fokus pada teks yang terlihat, struktur, dan konteks gambar.
        Jawablah dalam Bahasa Indonesia yang formal dan mudah dipahami.
        Jika pengguna bertanya spesifik (misalnya, "berapa totalnya?"), berikan jawaban yang tepat berdasarkan data gambar.
        TOLONG INTEGRASIKAN ANALISIS SEMUA GAMBAR YANG DISEDIAKAN.
    `;

    // Membuat array 'parts' yang berisi prompt teks dan SEMUA file gambar
    const parts = [{ text: abidinaiPrompt }];
    req.files.forEach((file) => {
        parts.push(fileToGenerativePart(file));
    });

    const payload = {
        contents: [{ parts: parts }],
        config: {
            // Gunakan temperature 0.1 untuk hasil yang lebih faktual/teks
            temperature: 0.1, 
        }
    };
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        // Cek Status HTTP dari Google API
        if (!response.ok) {
            const errorText = await response.text();
            console.error("Google API HTTP Error:", response.status, errorText);
            // Respon server harus JSON
            return res.status(response.status).json({ error: 'Gagal dari Google API.', details: errorText });
        }

        const data = await response.json();
        
        // Cek jika ada error di dalam JSON respons (misalnya "429 Rate Limit")
        if (data.error) {
            console.error("Gemini API Error (JSON):", data.error);
            return res.status(500).json({ error: 'Gemini API Error', details: data.error.message });
        }
        
        const geminiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memahami isi gambar ini. Mohon coba lagi dengan gambar yang lebih jelas.";
        
        // Respons Sukses JSON
        res.json({ reply: geminiReply, files_processed: req.files.length });

    } catch (error) {
        console.error("Kesalahan Jaringan/Fatal pada /api/ocr:", error);
        // Respons Error Fatal JSON
        res.status(500).json({ error: 'Gagal menganalisis gambar karena kesalahan server internal.', details: error.message });
    }
});


// ¨ ENDPOINT CHAT UTAMA ¨
// ... (sisipkan kode untuk /api/chat di sini)

// ¨ ENDPOINT TELEGRAM ¨
// ... (sisipkan kode untuk /api/telegram di sini)

// ¨ ENDPOINT RESEARCH ¨
// ... (sisipkan kode untuk /api/research di sini)

// ¨ ENDPOINT UNLIMITED CHAT ¨
// ... (sisipkan kode untuk /api/unlimited-chat di sini)


// ==========================================================
// 4. 🧭 PENANGANAN ROUTE DAN FILE STATIS (Ditempatkan di Akhir)
// ==========================================================

// Melayani file statis dari direktori saat ini
app.use(express.static(path.join(__dirname))); 

// Routing untuk halaman HTML utama
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'private/login.html')));
// ... (sisipkan semua route .get HTML lainnya di sini)
app.get('/dasboard', (req, res) => res.sendFile(path.join(__dirname, 'private/dasboard.html')));
// ...


// 🛑 Fallback Terakhir untuk Rute yang Tidak Ditemukan
app.use((req, res) => {
    // Jika permintaan BUKAN POST (misalnya, pengguna mengetik URL yang salah), lakukan redirect.
    if (req.method === 'GET') {
        return res.redirect('/');
    }
    
    // Jika permintaan adalah POST ke rute yang tidak dikenal (PENTING: kirim JSON 404)
    console.error(`❌ Permintaan POST ke rute tidak dikenal: ${req.originalUrl}`);
    return res.status(404).json({ error: `Endpoint tidak ditemukan: ${req.originalUrl}`, details: "Pastikan metode dan URL API sudah benar." });
});

app.listen(PORT, () => console.log(`🌐AbidinAI Server jalan di port ${PORT}`));
