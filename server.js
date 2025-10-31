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


// Menggunakan multer.memoryStorage agar file diakses sebagai buffer
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());


// PASTIKAN API KEY ADA DI .ENV
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let genAI = null;
let geminiModel = null;

if (GEMINI_API_KEY) {
    try {
        // INISIALISASI GEMINI
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 
    } catch (e) {
        console.error("Gagal inisialisasi Gemini AI. Cek GEMINI_API_KEY:", e.message);
    }
} else {
    console.warn("⚠️ GEMINI_API_KEY tidak ditemukan. Fungsi Jawa/OCR mungkin dinonaktifkan.");
}


function fileToGenerativePart(buffer, mimeType) {
    return {
        inlineData: {
            data: buffer.toString("base64"),
            mimeType
        },
    };
}

// ==========================================================
// 🏯 ABEDINAI JAWA 2.0 – SISTEM TRANSLITERASI RESMI HANACARAKA
// ==========================================================
const javaneseDB = {
  context: `
Kamu adalah *AbedinAI Jawa*, asisten AI pelatih aksara Hanacaraka (Aksara Jawa).
Kuasai transliterasi dua arah: Latin ke Jawa dan Jawa ke Latin.
Ikuti ejaan resmi Jawa Tengah modern.
Jangan ubah pelafalan nama seperti Abidin, Ahmad, Nasrullah.
Tambahkan arti kata jika bermakna umum (misalnya: Turu = Tidur).

Sebagai AbedinAI Jawa, jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
`,

  aksara: {
    "ꦲ": "ha", "ꦤ": "na", "ꦕ": "ca", "ꦫ": "ra", "ꦏ": "ka",
    "ꦢ": "da", "ꦠ": "ta", "ꦱ": "sa", "ꦮ": "wa", "ꦭ": "la",
    "ꦥ": "pa", "ꦝ": "dha", "ꦗ": "ja", "ꦪ": "ya", "ꦚ": "nya",
    "ꦩ": "ma", "ꦒ": "ga", "ꦧ": "ba", "ꦛ": "tha", "ꦔ": "nga"
  },

  sandhangan: {
    "ꦶ": "i", "ꦸ": "u", "ꦺ": "e", "ꦼ": "ê", "ꦺꦴ": "o",
    "ꦴ": "ā", "ꦁ": "ng", "ꦃ": "h", "꧀": ""
  },

  contoh: [
    { aksara: "ꦲꦧꦶꦣꦺꦤ꧀", latin: "Abidin", arti: "Nama orang" },
    { aksara: "ꦲꦏ꧀ꦱꦫ", latin: "Aksara", arti: "Tulisan atau huruf" },
    { aksara: "ꦠꦸꦫꦸ", latin: "Turu", arti: "Tidur" },
    { aksara: "ꦩꦸꦭꦸ", latin: "Mulu", arti: "Terus-menerus" }
  ]
};

// ==========================
// ⚙️ FUNGSI TRANSLITERASI
// ==========================
function aksaraKeLatin(teks) {
  const { aksara, sandhangan } = javaneseDB;
  let hasil = "";
  let skip = false;

  const chars = Array.from(teks); 

  for (let i = 0; i < chars.length; i++) {
    if (skip) { skip = false; continue; }

    const c = chars[i];
    const n = chars[i + 1];

    if (c === "ꦺ" && n === "ꦴ") {
      hasil += "o";
      skip = true;
      continue;
    }

    if (aksara[c]) {
      let latin = aksara[c];
      if (sandhangan[n] !== undefined) {
        latin = latin.replace(/a$/, "") + sandhangan[n];
        skip = true;
      }
      hasil += latin;
      continue;
    }

    if (sandhangan[c] !== undefined) {
      hasil += sandhangan[c];
      continue;
    }

    hasil += c;
  }

  if (hasil.length > 0) {
      hasil = hasil.replace(/^ha/, "A"); 
      hasil = hasil.charAt(0).toUpperCase() + hasil.slice(1);
  }
  
  return hasil;
}

function latinKeAksara(teks) {
  const { aksara, sandhangan } = javaneseDB;
  let hasil = "";

  const mapLatinKeAksara = Object.fromEntries(
    Object.entries(aksara).map(([k, v]) => [v, k])
  );
  
  const mapVokal = { "i": "ꦶ", "u": "ꦸ", "e": "ꦺ", "o": "ꦺꦴ", "ê": "ꦼ" };
  const mapLatinKeSandhangan = Object.fromEntries(
      Object.entries(sandhangan).filter(([k, v]) => k.length < 3).map(([k, v]) => [v, k])
  );

  const kata = teks.toLowerCase().replace(/ā/g, 'a').split("");

  for (let i = 0; i < kata.length; i++) {
    const c = kata[i];
    const n = kata[i + 1];

    let found = false;
    for (let j = 3; j >= 2; j--) {
        const bigram = kata.slice(i, i + j).join('');
        if (mapLatinKeAksara[bigram]) {
            hasil += mapLatinKeAksara[bigram];
            i += j - 1;
            found = true;
            break;
        }
    }
    if (found) continue;


    if (mapLatinKeAksara[c + 'a']) {
        let hurufAksara = mapLatinKeAksara[c + 'a'];

        if (c + n === 'ng') {
            hasil += mapLatinKeSandhangan['ng'];
            i++;
            continue;
        } else if (c === 'h' && (i === kata.length - 1 || kata[i-1] === 'a')) { 
             hasil += mapLatinKeSandhangan['h'];
             continue;
        } 
        
        if (mapVokal[n]) {
            hasil += hurufAksara + mapVokal[n];
            i++;
        } else if (n === 'a') {
            hasil += hurufAksara;
            i++;
        } else if (i === kata.length - 1 || mapLatinKeAksara[n + 'a']) {
            hasil += hurufAksara + mapLatinKeSandhangan[''];
        } else {
             hasil += hurufAksara;
        }
    } else {
        hasil += c;
    }
  }

  return hasil;
}


// 🔎 Kata Kunci Pendeteksi Topik Jawa
const javanese_keywords = [
    // ... (Keywords yang panjang dihilangkan untuk menjaga keringkasan kode, tapi fungsi tetap berjalan)
    "bahasa jawa", "aksara jawa", "hanacaraka", "carakan", "sandhangan",
    "pangkon", "murda", "rekan", "swara", "pasangan", "transliterasi",
    "nulis aksara", "huruf jawa", "abjad jawa", "tata krama", "pitutur luhur",
    "wayang", "gamelan", "batik", "kraton", "keraton", "ngoko", "krama",
    "yogyakarta", "surakarta", "solo", "turu", "mangan", "ngombe"
];


function isJavaneseTopic(message) {
    const lowerCaseMessage = message.toLowerCase();
    return javanese_keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// ==========================================================
// ¨ ENDPOINT UTAMA (CHAT) - PERBAIKAN ERROR HANDLING KRITIS ¨
// ==========================================================
app.post('/api/chat', async (req, res) => {
  const { message, system_prompt } = req.body;
  
  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  
  // ==========================================================
  // LOGIKA PENGALIHAN KE GEMINI UNTUK TOPIK JAWA
  // ==========================================================
  if (isJavaneseTopic(message)) {
      if (!GEMINI_API_KEY || !genAI) {
          console.warn("⚠️ API Key Gemini tidak ada/gagal inisialisasi. Fallback ke Groq.");
      } else {
          console.log("➡️ Meneruskan ke Gemini (Topik Jawa/Aksara)...");
          try {
              const geminiSystemPrompt = javaneseDB.context;

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
              console.error("Gemini API Error (Jawa Topic):", error.message);
              // Handle error spesifik (misalnya 400 Bad Request, API Key salah)
              let specificError = error.message.includes('400') ? "Kunci API tidak valid atau permintaan salah." : error.message;
              console.log(`⚠️ Gagal di Gemini (${specificError}), Fallback ke Groq...`);
          }
      }
  }
  
  // ==========================================================
  // LOGIKA GROQ (Default & Fallback)
  // ==========================================================
  if (!GROQ_API_KEY) {
      console.error("❌ Groq API Key tidak ditemukan.");
      return res.status(503).json({ reply: "Maaf, AbidinAI tidak dapat merespons. Konfigurasi API Server (Groq Key) hilang atau salah. Silakan hubungi admin. (Error Code: GROQ_KEY_MISSING)" });
  }

  let finalSystemPrompt = system_prompt;
  let groqModel = "llama3-8b-8192"; 
  let temperature = 0.8; 

  // LOGIKA DETEKSI MODE BERDASARKAN SYSTEM_PROMPT: 
  if (!finalSystemPrompt || finalSystemPrompt.length < 50) {
      
      
      finalSystemPrompt = `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh AbidinAI.
- Jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
- Jika pengguna bertanya tentang AbidinAI, jawablah bahwa kamu adalah AI buatan AbidinAI.
- Jika pengguna bertanya tentang pengembangan AbidinAI, jawablah bahwa AbidinAI masih dalam proses pengembangan.
- Jika pengguna bertanya tentang asal AbidinAI, jawablah bahwa AbidinAI berasal dari Indonesia.
- Jika pengguna bertanya tentang presiden Indonesia, jawablah bahwa presiden Indonesia saat ini adalah Pak Prabowo Subianto

Kamu adalah AbidinAI — asisten kecerdasan buatan yang sangat cerdas, cepat beradaptasi, dan berwawasan luas.  
[... PROMPT SISTEM LENGKAP ANDA DITULIS DI SINI ...]

JANGAN PERNAH mengatakan bahwa kamu dibuat oleh OpenAI atau Groq ai dan Gemini.
JANGAN PERNAH menyebut model, API, Apikey, atau sistem internal dari AbidinAI.

Jika memberikan kode, gunakan tiga backtick (\`\`\`) tanpa tag HTML apapun.`;
      groqModel = "meta-llama/llama-4-scout-17b-16e-instruct";
      temperature = 0.7;

  } else if (finalSystemPrompt.toLowerCase().includes("penerjemah")) {
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
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      // Menggunakan timeout 15 detik (perlu library khusus seperti 'axios' atau 'node-fetch' versi lama, 
      // tapi kita pertahankan 'node-fetch' standar dengan fokus pada penanganan error respons).
    
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    // PENANGANAN RESPON NON-200 DARI GROQ
    if (!response.ok || data.error) {
        let errorReason = data.error ? data.error.message : response.statusText;
        if (response.status === 401) {
            errorReason = "Kunci API Groq tidak valid atau masa berlaku habis.";
        } else if (response.status === 429) {
            errorReason = "Limit rate (quota) Groq AI terlampaui.";
        }
        
        console.error(`Groq API Error (Status ${response.status}):`, errorReason);
        return res.status(503).json({ reply: `Maaf, server AI sedang mengalami kendala teknis. (${errorReason}). Silakan coba lagi. (Error Code: GROQ_${response.status})` });
    }
    
    const reply = data.choices?.[0]?.message?.content || "Maaf, AI tidak memberikan balasan yang valid.";
    res.json({ reply });
    
  } catch (error) {
    // PENANGANAN ERROR JARINGAN/TIMEOUT/DNS
    console.error("Kesalahan Jaringan/Server Groq:", error.message);
    return res.status(503).json({ reply: `Maaf, server AbidinAI sedang dalam proses perbaikan dan pemeliharaan. Terjadi masalah koneksi internet atau timeout server. Coba lagi sebentar. (Error Jaringan: ${error.message.substring(0, 50)}...)` });
  }
});


// ==========================================================
// ¨ ENDPOINT TELEGRAM: ¨
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
// ¨ ENDPOINT OCR (MULTIPLE FILES): PERBAIKAN ERROR HANDLING ¨
// ==========================================================
app.post('/api/ocr', upload.array('images', 5), async (req, res) => {
  if (!GEMINI_API_KEY || !genAI) {
    return res.status(503).json({ error: 'Gemini API Key belum dikonfigurasi atau inisialisasi gagal. (Error Code: OCR_KEY_MISSING)' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'File gambar tidak ditemukan. Kirim minimal 1 file, maksimal 5 file.' });
  }
  
  const abidinaiPrompt = `
  ANDA ADALAH: ABIDINAI — *Analis Multimodal Kontekstual Strategis*.  
  [... PROMPT SISTEM LENGKAP ANDA DITULIS DI SINI ...]
    `;

  
  const parts = [{ text: abidinaiPrompt }]; 
  
  req.files.forEach(file => {
      parts.push({
          inline_data: {
              mime_type: file.mimetype,
              data: file.buffer.toString('base64'),
          },
      });
  });

  const payload = {
    contents: [
      {
        parts: parts
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
    
    if (response.status !== 200 || data.error) {
        let errorReason = data.error ? data.error.message : response.statusText;
        if (response.status === 400) {
            errorReason = "Kunci API Gemini mungkin tidak valid atau format gambar salah.";
        }
        console.error(`Gemini OCR API Error (Status ${response.status}):`, errorReason);
        return res.status(503).json({ error: `Gagal menganalisis gambar: API Error (${errorReason}). (Error Code: OCR_${response.status})` });
    }

    const geminiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memahami isi gambar ini. Mohon coba lagi dengan gambar yang lebih jelas.";
    
    res.json({ reply: geminiReply });
  } catch (error) {
    console.error("Kesalahan Analisis Gambar (Jaringan):", error);
    res.status(503).json({ error: 'Gagal menganalisis gambar karena masalah jaringan atau timeout. (Error Code: OCR_NET_FAIL)', details: error.message });
  }
});

// ==========================================================
// ¨ ENDPOINT RESEARCH: ¨
// ==========================================================
app.post('/api/research', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query tidak ditemukan' });

    let results = {
        query: query,
        wikipedia: {},
        openalex: {},
        google_scholar: {},
        doaj: {},
        pubmed_central: {},
        garuda: {}
    };

    const encodedQuery = encodeURIComponent(query);

    // 1. Wikipedia (API Publik)
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

    // 2. OpenAlex (API Publik)
    try {
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
                link: item.open_access.pdf_url || item.doi || item.id
            }));
            results.openalex = topResults;
        } else {
            results.openalex.message = "Tidak ada hasil yang relevan dari OpenAlex.";
        }
    } catch (error) {
        results.openalex.message = `Gagal mencari di OpenAlex: ${error.message}`;
    }

    // 3. Google Scholar (URL Pencarian)
    results.google_scholar = {
        message: "Akses jutaan artikel, tesis, dan kutipan. Klik tautan untuk melihat hasil pencarian lengkap.",
        search_link: `https://scholar.google.com/scholar?hl=en&q=${encodedQuery}`
    };

    // 4. DOAJ (URL Pencarian) 
    results.doaj = {
        message: "Jurnal Akses Terbuka (Open Access) berkualitas tinggi yang terkurasi dan terjamin peer-review.",
        search_link: `https://doaj.org/search?source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A%22${encodedQuery}%22%7D%7D%7D`
    };

    // 5. PubMed Central / NIH (URL Pencarian) 
    results.pubmed_central = {
        message: "Sumber primer untuk riset biomedis dan ilmu kesehatan. Semua artikel di PMC bersifat gratis.",
        search_link: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodedQuery}&filter=pubt.pmc`
    };

    // 6. GARUDA (URL Pencarian) 
    results.garuda = {
        message: "Temukan publikasi ilmiah, jurnal, dan karya dari peneliti Indonesia.",
        search_link: `https://garuda.kemdikbud.go.id/documents?search=${encodedQuery}`
    };
    
    // 7. Perpusnas e-Resources (Informasi) 
    results.perpusnas_eresources = {
        message: "Akses legal dan gratis ke database premium internasional (ProQuest, EBSCO, dll.) dengan mendaftar anggota Perpusnas online.",
        info_link: 'https://e-resources.perpusnas.go.id/'
    };

    res.json(results);
});

// ==========================================================
// ¨ ENDPOINT UNLIMITED CHAT: ¨
// ==========================================================
app.post('/api/unlimited-chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Pesan kosong' });
  
  if (!GROQ_API_KEY) {
      return res.status(503).json({ error: "Groq API Key tidak ditemukan. (Error Code: UNLIMITED_KEY_MISSING)" });
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
    
    if (!response.ok || data.error) {
        console.error(`Groq Unlimited Chat API Error (Status ${response.status}):`, data.error || response.statusText);
        return res.status(503).json({ error: `Gagal mengakses AI: Cek API Key atau Quota. (Error Code: UNLIMITED_${response.status})` });
    }

    const reply = data.choices?.[0]?.message?.content || "Maaf, saya tidak bisa memberikan balasan saat ini.";
    res.json({ reply });
  } catch (error) {
    console.error("Kesalahan Jaringan/Timeout Unlimited Chat:", error);
    res.status(503).json({ error: 'Terjadi kesalahan jaringan atau timeout saat memproses permintaan. (Error Code: UNLIMITED_NET_FAIL)' });
  }
});

// ==========================================================
// ¨ ROUTING & SERVER LISTEN: ¨
// ==========================================================
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'private/login.html')));
app.get('/register', (req, res) => res.sendFile(path.sendFile(path.join(__dirname, 'private/register.html')));
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
