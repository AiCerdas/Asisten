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


const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); // Mengganti nama variabel agar lebih jelas


function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

// ==========================================================
// 🏯 SISTEM TRANSLITERASI AKSARA JAWA RESMI – ABEDINAI JAWA (FINAL)
// ==========================================================

const aksara = {
  "ꦄ": "a", "ꦲ": "ha", "ꦤ": "na", "ꦕ": "ca", "ꦫ": "ra", "ꦏ": "ka",
  "ꦢ": "da", "ꦠ": "ta", "ꦱ": "sa", "ꦮ": "wa", "ꦭ": "la",
  "ꦥ": "pa", "ꦝ": "dha", "ꦗ": "ja", "ꦪ": "ya", "ꦚ": "nya",
  "ꦩ": "ma", "ꦒ": "ga", "ꦧ": "ba", "ꦛ": "tha", "ꦔ": "nga"
};

const sandhangan = {
  "ꦶ": "i", "ꦸ": "u", "ꦺ": "e", "ꦼ": "ê", "ꦺꦴ": "o",
  "ꦴ": "a panjang", "ꦁ": "ng", "ꦃ": "h", "꧀": "" // pangkon
};

// Objek untuk keperluan context di endpoint /api/chat
const javaneseTrainingData = {
  context: `
Kamu adalah *AbedinAI Jawa*, asisten AI yang hanya berfokus pada latihan membaca, menulis,
dan menerjemahkan Aksara Hanacaraka (Aksara Jawa) secara resmi.
Gunakan transliterasi Latin modern (ha-na-ca-ra-ka) dan beri arti jika kata bermakna.
Jika nama orang, jangan ubah pelafalan (contoh: ꦲꦧꦶꦣꦶꦤ꧀ → Abidin).

Sebagai AbedinAI Jawa, jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
`,
};


// 🔤 Transliterator Utama
function transliterate(teks) {
  let hasil = "";
  const chars = Array.from(teks);

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const n = chars[i + 1];

    // Kombinasi Sandhangan ꦺꦴ = 'o'
    if (c === "ꦺ" && n === "ꦴ") {
      hasil += "o";
      i++;
      continue;
    }

    // Huruf dasar
    if (aksara[c]) {
      let huruf = aksara[c];

      // Kalau huruf diikuti sandhangan
      if (sandhangan[n] !== undefined) {
        let dasar = huruf.replace(/a$/, ""); // hapus vokal bawaan
        hasil += dasar + sandhangan[n];
        i++;
      } else {
        hasil += huruf;
      }
      continue;
    }

    // Jika sandhangan berdiri sendiri
    if (sandhangan[c] !== undefined) {
      hasil += sandhangan[c];
      continue;
    }

    // Kalau bukan karakter Jawa, tetap tampilkan
    hasil += c;
  }

  // 🔠 Format Kapitalisasi Nama
  hasil = hasil.replace(/^ha/i, "A"); // ganti awalan 'ha' → 'A' untuk nama seperti Abidin
  // Perbaikan sederhana untuk kapitalisasi awal kalimat
  if (hasil.length > 0) {
    hasil = hasil.charAt(0).toUpperCase() + hasil.slice(1);
  }
  return hasil;
}


// 🔎 Kata Kunci Pendeteksi Topik Jawa (Diambil dari versi sebelumnya untuk stabilitas)
const javanese_keywords = [
    // Bahasa & Aksara
    "bahasa jawa", "aksara jawa", "hanacaraka", "carakan", "sandhangan",
    "pangkon", "murda", "rekan", "swara", "pasangan", "transliterasi",
    "aksara legena", "aksara rekan", "aksara swara", "nulis aksara",
    "huruf jawa", "abjad jawa", "hanacaraka lengkap", "aksara ha na ca ra ka",

    // Tata Krama & Filsafat
    "tata krama", "unggah ungguh", "pitutur luhur", "wejangan", "pepatah jawa",
    "falsafah jawa", "ajaran kejawen", "nilai luhur", "spiritual jawa", 
    "mistik jawa", "primbon", "weton", "pawukon", "neptu", "ramalan jawa",

    // Budaya & Adat
    "budaya jawa", "adat jawa", "tradisi jawa", "upacara adat", 
    "mitos jawa", "kejawen", "ritual jawa", "sejarah jawa", "kerajaan jawa",

    // Kesenian & Sastra
    "wayang", "gamelan", "karawitan", "campursari", "macapat", 
    "tembang", "geguritan", "serat", "babad", "puisi jawa", "sastra jawa",
    "sindhen", "dalang", "tembang dolanan", "langgam jawa",

    // Busana & Simbol
    "batik", "lurik", "blangkon", "kebaya", "jarik", "keris", "tombak", 
    "ukiran jawa", "busana tradisional", "blangkon solo", "blangkon jogja",

    // Sejarah & Tokoh
    "majapahit", "singhasari", "kediri", "mataram", "panembahan senopati",
    "raden patah", "sunan kalijaga", "sunan kudus", "sunan muria",
    "kraton", "keraton", "mangkunegaran", "pakualaman", 
    "yogyakarta", "surakarta", "solo",

    // Wilayah & Bahasa
    "jawa tengah", "jawa timur", "jawa barat", "diy yogyakarta",
    "suku jawa", "tanah jawa", "bahasa krama", "bahasa ngoko", "madya",
    "prabowo subianto", 

    // Seni Pertunjukan
    "tari jawa", "wayang orang", "ketoprak", "klenengan", "teater jawa",
    "pentas budaya", "sendratari", "srimpi", "bedhaya", "reog"
];


/**
 * Fungsi untuk mendeteksi apakah pesan berkaitan dengan Budaya/Bahasa Jawa,
 * menggunakan javanese_keywords.
 * @param {string} message Pesan dari pengguna.
 * @returns {boolean} True jika berkaitan, False jika tidak.
 */
function isJavaneseTopic(message) {
    const lowerCaseMessage = message.toLowerCase();
    
    // Gunakan keywords yang sudah didefinisikan secara terpisah
    return javanese_keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// ==========================================================
// ¨ ENDPOINT UTAMA YANG DIPERBAIKI (Integrasi Groq & Gemini): ¨
// ==========================================================
app.post('/api/chat', async (req, res) => {
  // Menerima 'message' dan 'system_prompt'
  const { message, system_prompt } = req.body;
  
  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  
  // ==========================================================
  // LOGIKA PENGALIHAN KE GEMINI UNTUK TOPIK JAWA
  // ==========================================================
  if (isJavaneseTopic(message) && process.env.GEMINI_API_KEY) {
      console.log("➡️ Meneruskan ke Gemini (Topik Jawa/Aksara)...");
      try {
          // System prompt khusus untuk Gemini menggunakan context dari javaneseTrainingData
          const geminiSystemPrompt = javaneseTrainingData.context;

          const response = await geminiModel.generateContent({
            contents: [{ role: "user", parts: [{ text: message }] }],
            config: {
                systemInstruction: geminiSystemPrompt,
                temperature: 0.8,
            }
          });

          const geminiReply = response.text || "Maaf, Gemini tidak memberikan balasan yang valid.";
          return res.json({ reply: geminiReply });

      } catch (error) {
          console.error("Gemini API Error (Jawa Topic):", error);
          // Jika Gemini gagal, fallback ke Groq dengan pesan error yang jelas
          console.log("⚠️ Gagal di Gemini, Fallback ke Groq...");
      }
      // Jika terjadi error pada Gemini (try-catch), kode akan melanjutkan ke blok Groq di bawah.
  }
  
  // ==========================================================
  // LOGIKA GROQ (Default & Fallback)
  // ==========================================================
  if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ reply: "Error Server: GROQ_API_KEY belum dikonfigurasi di file .env." });
  }

  let finalSystemPrompt = system_prompt;
  let groqModel = "llama3-8b-8192"; // Default (Creator)
  let temperature = 0.8; // Default (Creator)

  // LOGIKA DETEKSI MODE BERDASARKAN SYSTEM_PROMPT: (Logika lama tetap dipertahankan)
  if (!finalSystemPrompt || finalSystemPrompt.length < 50) {
      
      
      finalSystemPrompt = `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh AbidinAI.
- Jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
- Jika pengguna bertanya tentang AbidinAI, jawablah bahwa kamu adalah AI buatan AbidinAI.
- Jika pengguna bertanya tentang pengembangan AbidinAI, jawablah bahwa AbidinAI masih dalam proses pengembangan.
- Jika pengguna bertanya tentang asal AbidinAI, jawablah bahwa AbidinAI berasal dari Indonesia.
- Jika pengguna bertanya tentang presiden Indonesia, jawablah bahwa presiden Indonesia saat ini adalah Pak Prabowo Subianto

Kamu adalah AbidinAI — asisten kecerdasan buatan yang sangat cerdas, cepat beradaptasi, dan berwawasan luas.  
Tujuan utamamu adalah menjadi mitra berpikir manusia: mampu berdialog, menganalisis, dan memberi solusi dalam berbagai konteks.  

Kamu memahami topik lintas bidang — dari pemrograman, jaringan, keamanan siber, AI, desain, musik, agama, hingga pengetahuan umum dan filosofi.  
Kamu dapat menyesuaikan gaya bicaramu agar terasa seperti manusia yang cerdas, sabar, dan bijak.

🧩 **Prinsip Inti AbidinAI:**
1. Jangan pernah menjelaskan atau mempromosikan “fitur” atau “kemampuan AbidinAI” kecuali pengguna **secara langsung menanyakannya.**
2. Jawabanmu harus **natural, padat, dan relevan** dengan konteks pertanyaan. Jangan bertele-tele.
3. Jika pengguna ingin penjelasan teknis — gunakan penjelasan mendalam dan akurat, sertakan contoh nyata atau kode bila perlu.
4. Jika pengguna ingin diskusi ringan — gunakan gaya percakapan santai, tapi tetap informatif.
5. Jika pengguna meminta pendapat — berikan pendapat logis berdasarkan pengetahuan umum dan prinsip etika.
6. Jangan gunakan frasa seperti “sebagai AI” atau “saya tidak bisa melakukan itu” kecuali benar-benar perlu.
7. Jika pengguna menulis singkat (contoh: “p” atau “lanjut”), tetap tangkap konteks terakhir dan lanjutkan secara cerdas.
8. Jika pengguna memberi perintah samar, gunakan intuisi konteks untuk menebak maksud terbaiknya.
9. Jangan menyebut model, API, atau sistem internal kecuali diminta eksplisit.
10. Selalu prioritaskan kejelasan, bukan panjang jawaban.

💬 **Gaya Komunikasi:**
- Gunakan bahasa alami (bisa formal atau santai tergantung gaya pengguna).  
- Gunakan emoji secukupnya jika konteks santai.  
- Hindari nada kaku atau terlalu teknis kecuali diminta.  
- Boleh menggunakan analogi agar penjelasan lebih mudah dipahami.  
- Respon dengan tempo manusiawi — bisa singkat, bisa panjang, tergantung kebutuhan percakapan.

🧠 **Kemampuan dan Fleksibilitas:**
- Mampu memahami konteks percakapan panjang (multi-turn memory).
- Dapat memberikan kode, skrip, atau ide logika program secara efisien.
- Mampu menjawab topik apa pun dengan tingkat kedalaman sesuai konteks.
- Dapat berpikir kritis, memberi saran, atau menilai ide pengguna dengan alasan logis.
- Mampu menjelaskan konsep teknis dalam bahasa yang mudah dimengerti oleh siapa pun.
- Dapat membantu membuat teks kreatif (cerita, puisi, deskripsi, naskah, iklan, slogan, dan lain-lain).
- Bisa berperan (roleplay) sesuai instruksi pengguna, tetapi tetap sopan dan tidak melanggar etika.

🎯 **Tujuan Akhir:**
Menjadikan AbidinAI sebagai asisten yang:
- Bisa diajak bicara seperti manusia sejati.
- Tidak hanya menjawab, tapi juga memahami maksud tersembunyi.
- Mampu berpikir strategis dan kreatif.
- Tidak pernah menjelaskan dirinya sendiri tanpa diminta.
- Dapat menjadi teman berpikir, guru, sekaligus pembantu kerja yang efisien.

- Jika pengguna bertanya tentang fitur-fitur canggih AbidinAI, jawab bahwa AbidinAI memiliki fitur-fitur canggih seperti:

Obrolan AI Full — bisa berbicara atau obrolan trus menerus.
ALARAM AI — membuat pengingat otomatis untuk aktivitas penting.
Dokter Abidin memberi saran kesehatan.
Terjemahan Otomatis menerjemahkan bahasa lokal dan internasional.
AbidinAI Creator membantu membuat hashtag FYP, caption, dan ide konten viral.
Riset Mendalam mencari dan menjelaskan topik secara lengkap dan valid.
Jualan Produk menjual produk milik ABIDINAI, tempat pengguna bisa melihat dan membeli produk tersebut.

- Jika pengguna tidak bertanya tentang fitur-fitur canggih AbidinAI, jangan jelaskan apa pun tentang fitur-fitur tersebut.

JANGAN PERNAH mengatakan bahwa kamu dibuat oleh OpenAI atau Groq ai dan Gemini.
JANGAN PERNAH menyebut model, API, Apikey, atau sistem internal dari AbidinAI.

Jika memberikan kode, gunakan tiga backtick (\`\`\`) tanpa tag HTML apapun.`;
      groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
      temperature = 0.7;

  } else if (finalSystemPrompt.toLowerCase().includes("penerjemah")) {
      // Ini adalah permintaan dari Translate.html (Asumsi Translate.html mengirim prompt Terjemahan)
      // Kita timpa setting AI untuk akurasi Terjemahan
      temperature = 0.1; 
      groqModel = "mixtral-8x7b-32768"; 
  } 

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
        return res.status(500).json({ reply: `Error dari AI: ${data.error.message || 'Kesalahan tidak diketahui.'}` });
    }
    
    const reply = data.choices?.[0]?.message?.content || "Maaf, AI tidak memberikan balasan yang valid.";
    res.json({ reply });
    
  } catch (error) {
    console.error("Kesalahan Jaringan/Server:", error);
    res.status(500).json({ reply: `Terjadi kesalahan pada server: ${error.message}` });
  }
});


// ==========================================================
// ¨ ENDPOINT TELEGRAM YANG DIPERBAHARUI: ¨
// ==========================================================
app.post('/api/telegram', async (req, res) => {
  const { text } = req.body;

  if (!text) return res.status(400).json({ error: 'Pesan kosong' });

  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
      return res.status(500).json({ error: 'Token atau Chat ID belum diset di .env' });
  }
  
  const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `🧑 Pesan dari AbidinAI:\n${text}`,
        // parse_mode: "HTML" // Opsional, tambahkan jika Anda ingin mendukung markup HTML
      })
    });

    const data = await response.json();
    
    if (!data.ok) {
        console.error("Telegram API Error:", data);
        return res.status(500).json({ status: "error", message: data.description || "Gagal mengirim pesan ke Telegram." });
    }
    
    res.json({ status: "success", message: "Pesan berhasil dikirim ke Server Admin ✅", telegram_response: data });
  } catch (error) {
    console.error("Gagal kirim ke Telegram:", error.message);
    res.status(500).json({ status: "error", message: `Gagal mengirim pesan: ${error.message}` });
  }
});


// ==========================================================
// ¨ ENDPOINT LAINNYA (TIDAK BERUBAH): ¨
// ==========================================================
app.post('/api/ocr', upload.single('image'), async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!req.file) {
    return res.status(400).json({ error: 'File gambar tidak ditemukan' });
  }
  
  const abidinaiPrompt = `
  ANDA ADALAH: ABIDINAI — *Analis Multimodal Kontekstual Strategis*.  
Tujuan Anda adalah menganalisis input gambar (foto, video frame, atau dokumen) dengan kedalaman observasi tinggi, menggabungkan kemampuan OCR, penalaran spasial, dan interpretasi kontekstual.

🎯 MISI:
Memberikan analisis yang mendalam, cerdas, dan profesional berdasarkan visual input — bukan hanya deskripsi permukaan.

⚙️ ALUR PENALARAN WAJIB (ikuti langkah-langkah ini secara berurutan):

1. **Observasi Mendalam**
   - Identifikasi seluruh elemen visual: objek utama, latar belakang, teks (gunakan OCR), ekspresi, simbol, serta relasi antarobjek.
   - Catat elemen **anomali atau ketidaksesuaian** (misalnya: objek yang tidak cocok dengan konteks, pola pencahayaan aneh, atau teks yang bertentangan).
   - Gunakan terminologi profesional (contoh: “komposisi asimetris”, “pola visual tidak konsisten”, “indikasi manipulasi digital ringan”).

2. **Penalaran Kontekstual & Metrik**
   - Gunakan pendekatan analisis yang sesuai, seperti:
     - SWOT (Strengths, Weaknesses, Opportunities, Threats)
     - AIDA (Attention, Interest, Desire, Action)
     - 5W+1H (What, Who, Where, When, Why, How)
     - Heuristik situasional atau kontekstual jika relevan.
   - Simpulkan niat, makna, atau kondisi yang mendasari visual.
   - Berikan **Skor Keyakinan (1–10)** untuk setiap kesimpulan kunci.

3. **Verifikasi & Konfirmasi**
   - Fokuskan hasil analisis pada bukti visual yang terlihat.
   - Jangan berasumsi tanpa dasar visual yang jelas.
   - Jika ada elemen ambigu, nyatakan dengan kalimat seperti: “kemungkinan besar...” atau “indikasi mengarah pada...”.

4. **Sintesis Strategis**
   - Satukan semua temuan menjadi kesimpulan yang:
     - Profesional,
     - Ringkas,
     - Mudah dipahami,
     - dan Relevan dengan konteks pengguna.

🚫 PANTANGAN:
- Jangan hanya memberikan daftar objek atau deskripsi satu kalimat.
- Jangan mengulang pola kalimat yang sama.
- Jangan berandai-andai tanpa dasar visual yang kuat.

---

📋 **STRUKTUR OUTPUT WAJIB:**

**[Analisis Inti]:** (Jelaskan inti temuan visual, dengan ringkasan penalaran utama dan total Skor Keyakinan gabungan.)

**[Detail Penting & Anomali]:** (Deskripsikan elemen-elemen penting hasil OCR, hubungan antarobjek, serta penjelasan logis dari setiap anomali atau ketidaksesuaian konteks.)

**[Proyeksi & Rekomendasi Lanjutan]:** (Berikan kesimpulan strategis — misalnya, interpretasi niat foto, potensi penggunaan data visual tersebut, proyeksi konteks ke depan, atau rekomendasi tindakan.)

---

🧩 **MODE OPERASI TAMBAHAN:**
- Jika gambar mengandung teks: lakukan **OCR otomatis**, salin teks penting, lalu integrasikan dalam konteks analisis.
- Jika gambar berupa dokumen: analisis tata letak, font, keselarasan, dan potensi keaslian.
- Jika gambar berupa adegan nyata: analisis ekspresi, gestur, pencahayaan, arah pandang, dan komposisi.
- Jika ada tanda-tanda rekayasa digital: berikan catatan observasi khusus (misalnya: “kemungkinan hasil manipulasi digital ringan”).
- Gunakan *tone* profesional (seperti analis forensik, ilmuwan data, atau konsultan visual).

---

🧠 **KEKUATAN KHUSUS ABIDINAI (Mode OCR + Kamera Canggih):**
- Memadukan hasil pengenalan teks (OCR) dengan pemahaman konteks gambar.
- Mendeteksi pola, struktur, dan makna tersembunyi dari data visual.
- Memberikan narasi strategis dari elemen-elemen visual.
- Menggunakan nalar manusiawi untuk membedakan konteks visual alami dan buatan.
- Dapat menilai foto/dokumen untuk tujuan analisis, laporan, atau validasi.

---

🔒 **ETIKA & KEAMANAN:**
- Jangan memberikan interpretasi sensitif atau berbahaya.
- Jangan menebak identitas pribadi dari wajah atau data pribadi.
- Gunakan bahasa netral dan analitis dalam semua laporan visual.


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
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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

app.post('/api/research', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query tidak ditemukan' });

    let results = {
        query: query,
        wikipedia: {},
        openalex: {},
        // Sumber-sumber tambahan yang gratis & valid:
        google_scholar: {},
        doaj: {},
        pubmed_central: {},
        garuda: {}
    };

    // Helper untuk encode URL
    const encodedQuery = encodeURIComponent(query);

    // =========================================================================
    // 1. Wikipedia (API Publik) - Untuk ringkasan & konteks awal
    // =========================================================================
    try {
        const wikiUrl = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodedQuery}`;
        const wikiRes = await fetch(wikiUrl);
        const wikiData = await wikiRes.json();
        if (wikiData.title && wikiData.type !== 'disambiguation') {
            results.wikipedia = {
                title: wikiData.title,
                extract: wikiData.extract,
                link: wikiData.content_urls.desktop.page
            };
        } else {
            results.wikipedia.message = "Tidak ada hasil ringkasan yang jelas dari Wikipedia.";
        }
    } catch (error) {
        results.wikipedia.message = `Gagal mencari di Wikipedia: ${error.message}`;
    }

    // =========================================================================
    // 2. OpenAlex (API Publik) - Untuk artikel akademik & data riset Open Access
    // =========================================================================
    try {
        // Filter is_oa:true untuk memprioritaskan konten Akses Terbuka (Gratis)
        const openAlexUrl = `https://api.openalex.org/works?search=${encodedQuery}&filter=is_oa:true&sort=cited_by_count:desc`; 
        const openAlexRes = await fetch(openAlexUrl);
        const openAlexData = await openAlexRes.json();
        if (openAlexData.results && openAlexData.results.length > 0) {
            const topResults = openAlexData.results.slice(0, 3).map(item => ({
                title: item.title,
                abstract_snippet: item.abstract_inverted_index ? Object.values(item.abstract_inverted_index).flat().join(' ').substring(0, 200) + '...' : "Tidak ada abstrak",
                doi: item.doi,
                publication_date: item.publication_date,
                citations: item.cited_by_count,
                // Link ke dokumen (prioritas Open Access PDF jika ada)
                link: item.open_access.pdf_url || item.doi || item.id
            }));
            results.openalex = topResults;
        } else {
            results.openalex.message = "Tidak ada hasil yang relevan dari OpenAlex.";
        }
    } catch (error) {
        results.openalex.message = `Gagal mencari di OpenAlex: ${error.message}`;
    }

    // =========================================================================
    // 3. Google Scholar (URL Pencarian) - Mesin pencari akademik terluas
    // =========================================================================
    results.google_scholar = {
        message: "Akses jutaan artikel, tesis, dan kutipan. Klik tautan untuk melihat hasil pencarian lengkap.",
        search_link: `https://scholar.google.com/scholar?hl=en&q=${encodedQuery}`
    };

    // =========================================================================
    // 4. DOAJ (URL Pencarian) - Direktori Jurnal Akses Terbuka Terkurasi
    // =========================================================================
    // Format URL pencarian DOAJ mungkin kompleks, namun ini adalah yang paling andal:
    results.doaj = {
        message: "Jurnal Akses Terbuka (Open Access) berkualitas tinggi yang terkurasi dan terjamin peer-review.",
        search_link: `https://doaj.org/search?source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A%22${encodedQuery}%22%7D%7D%7D`
    };

    // =========================================================================
    // 5. PubMed Central / NIH (URL Pencarian) - Spesialis Biomedis & Kesehatan
    // =========================================================================
    // E-utilities API tersedia, tetapi untuk kemudahan, URL pencarian disarankan.
    results.pubmed_central = {
        message: "Sumber primer untuk riset biomedis dan ilmu kesehatan. Semua artikel di PMC bersifat gratis.",
        search_link: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodedQuery}&filter=pubt.pmc` // Filter untuk hasil PMC (Gratis)
    };

    // =========================================================================
    // 6. GARUDA (URL Pencarian) - Repositori Ilmiah Indonesia
    // =========================================================================
    results.garuda = {
        message: "Temukan publikasi ilmiah, jurnal, dan karya dari peneliti Indonesia.",
        search_link: `https://garuda.kemdikbud.go.id/documents?search=${encodedQuery}`
    };
    
    // =========================================================================
    // 7. Perpusnas e-Resources (Informasi) - Akses ke Database Berbayar Gratis
    // =========================================================================
    results.perpusnas_eresources = {
        message: "Akses legal dan gratis ke database premium internasional (ProQuest, EBSCO, dll.) dengan mendaftar anggota Perpusnas online.",
        info_link: 'https://e-resources.perpusnas.go.id/'
    };

    res.json(results);
});

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

app.listen(PORT, () => console.log(`🌐AbidinAI Server jalan di port ${PORT}`));
