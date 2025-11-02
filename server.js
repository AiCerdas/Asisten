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


// Ubah dari single() ke array() untuk mendukung hingga 5 file
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());


// Inisialisasi Gemini hanya jika kunci tersedia
let genAI;
let geminiModel;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 
}


/**
 * Fungsi helper untuk mengkonversi buffer file menjadi Generative Part
 * @param {Buffer} buffer - Buffer data file.
 * @param {string} mimeType - Tipe MIME file.
 * @returns {object} - Objek inlineData untuk Gemini API.
 */
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
// (Bagian data dan fungsi transliterasi Jawa tetap dipertahankan)
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
        let konsonan = c;

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


const javanese_keywords = [
    "bahasa jawa", "aksara jawa", "hanacaraka", "carakan", "sandhangan",
    "pangkon", "murda", "rekan", "swara", "pasangan", "transliterasi",
    "budaya jawa", "adat jawa", "wayang", "gamelan", "macapat", 
    "batik", "lurik", "blangkon", "majapahit", "yogyakarta", "surakarta", 
    "suku jawa", "bahasa krama", "bahasa ngoko", "prabowo subianto"
];


function isJavaneseTopic(message) {
    const lowerCaseMessage = message.toLowerCase();
    return javanese_keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// ==========================================================
// ¨ ENDPOINT UTAMA (CHAT): ¨
// ==========================================================
app.post('/api/chat', async (req, res) => {
  const { message, system_prompt } = req.body;
  
  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  
  // LOGIKA PENGALIHAN KE GEMINI UNTUK TOPIK JAWA
  if (isJavaneseTopic(message) && process.env.GEMINI_API_KEY && geminiModel) {
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
          console.error("Gemini API Error (Jawa Topic):", error);
      }
  }
  
  // LOGIKA GROQ (Default & Fallback)
  if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ reply: "Error Server: GROQ_API_KEY belum dikonfigurasi di file .env." });
  }

  let finalSystemPrompt = system_prompt;
  let groqModel = "llama3-8b-8192"; 
  let temperature = 0.8; 

  if (!finalSystemPrompt || finalSystemPrompt.length < 50) {
      finalSystemPrompt = `Kamu adalah AbidinAI, asisten cerdas yang dikembangkan oleh AbidinAI.
- Jika pengguna bertanya siapa pembuatmu, jawab bahwa kamu dibuat dan dikembangkan oleh Abidin.
- Jika pengguna bertanya tentang AbidinAI, jawablah bahwa kamu adalah AI buatan AbidinAI.
- Jika pengguna bertanya tentang pengembangan AbidinAI, jawablah bahwa AbidinAI masih dalam proses pengembangan.
- Jika pengguna bertanya tentang asal AbidinAI, jawablah bahwa AbidinAI berasal dari Indonesia.
- Jika pengguna bertanya tentang presiden Indonesia, jawablah bahwa presiden Indonesia saat ini adalah Pak Prabowo Subianto
... [PROMPT UTAMA ABIDINAI SANGAT PANJANG, DISINGKAT UNTUK KODE INI] ...
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
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    if (data.error) {
        return res.status(500).json({ reply: `Error dari AI: ${data.error.message || 'Kesalahan tidak diketahui.'}` });
    }
    
    const reply = data.choices?.[0]?.message?.content || "Maaf, AI tidak memberikan balasan yang valid.";
    res.json({ reply });
    
  } catch (error) {
    res.status(500).json({ reply: `Terjadi kesalahan pada server: ${error.message}` });
  }
});


// ==========================================================
// ¨ ENDPOINT MULTIMODAL/OCR (GUARDRAIL & MULTI-GAMBAR): ¨
// ==========================================================
app.post('/api/ocr', upload.array('images', 5), async (req, res) => {
  // 1. GUARDRAIL: Cek Kunci API
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    // Memberikan error JSON yang benar (500) agar frontend tidak gagal parse.
    return res.status(500).json({ error: 'Server Error: GEMINI_API_KEY belum dikonfigurasi. Harap cek .env' });
  }

  // 2. Cek File
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'File gambar tidak ditemukan. Harap unggah minimal 1 gambar.' });
  }

  // System Prompt (Dipotong agar kode tidak terlalu panjang, isinya sama dengan sebelumnya)
  const abidinaiPrompt = `
  ANDA ADALAH: ABIDINAI — *Analis Multimodal Kontekstual Strategis*.  
Tujuan Anda adalah menganalisis input gambar (foto, video frame, atau dokumen) dengan kedalaman observasi tinggi, menggabungkan kemampuan OCR, penalaran spasial, dan interpretasi kontekstual.

... [PROMPT PANJANG DARI VERSI ASLI ANDA] ...

Struktur Output WAJIB:
[Analisis Inti]: (Jawaban langsung, ringkasan penalaran utama, termasuk Skor Keyakinan total.)
[Detail Penting & Anomali]: (Dukungan observasi visual, rincian konteks, dan penjelasan terperinci mengenai Anomali yang ditemukan.)
[Proyeksi & Rekomendasi Lanjutan]: (Kesimpulan berbasis penalaran canggih, Proyeksi Skenario Terdekat, serta saran proaktif.)
`;


  // 3. Persiapan Parts untuk Gemini (System Prompt + Gambar + User Prompt)
  const parts = [];
  parts.push({ text: abidinaiPrompt });

  req.files.forEach(file => {
      parts.push(fileToGenerativePart(file.buffer, file.mimetype));
  });

  const { user_prompt } = req.body;
  if (user_prompt) {
      parts.push({ text: `Instruksi Tambahan dari Pengguna: ${user_prompt}` });
  }

  const payload = {
    contents: [{ parts: parts }]
  };

  // 4. Panggil Gemini API
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) {
        // Jika Gemini mengembalikan error (misalnya API Key invalid), kembalikan error JSON
         return res.status(500).json({ error: `Gemini API Error: ${data.error.message || 'Kesalahan API tidak diketahui.'}` });
    }

    const geminiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memahami isi gambar/gambar-gambar ini. Mohon coba lagi dengan gambar yang lebih jelas.";
    
    res.json({ reply: geminiReply });
  } catch (error) {
    // Catch error network/server lain
    res.status(500).json({ error: 'Gagal menganalisis gambar: Kesalahan jaringan atau server.', details: error.message });
  }
});


// ==========================================================
// ¨ ENDPOINT TELEGRAM DAN LAINNYA (TIDAK BERUBAH): ¨
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
        return res.status(500).json({ status: "error", message: data.description || "Gagal mengirim pesan ke Telegram." });
    }
    
    res.json({ status: "success", message: "Pesan berhasil dikirim ke Server Admin ✅", telegram_response: data });
  } catch (error) {
    res.status(500).json({ status: "error", message: `Gagal mengirim pesan: ${error.message}` });
  }
});


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

    // 1. Wikipedia
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

    // 2. OpenAlex
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

    // 3. Google Scholar
    results.google_scholar = {
        message: "Akses jutaan artikel, tesis, dan kutipan. Klik tautan untuk melihat hasil pencarian lengkap.",
        search_link: `https://scholar.google.com/scholar?hl=en&q=${encodedQuery}`
    };

    // 4. DOAJ
    results.doaj = {
        message: "Jurnal Akses Terbuka (Open Access) berkualitas tinggi yang terkurasi dan terjamin peer-review.",
        search_link: `https://doaj.org/search?source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A%22${encodedQuery}%22%7D%7D%7D`
    };

    // 5. PubMed Central / NIH
    results.pubmed_central = {
        message: "Sumber primer untuk riset biomedis dan ilmu kesehatan. Semua artikel di PMC bersifat gratis.",
        search_link: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodedQuery}&filter=pubt.pmc` 
    };

    // 6. GARUDA
    results.garuda = {
        message: "Temukan publikasi ilmiah, jurnal, dan karya dari peneliti Indonesia.",
        search_link: `https://garuda.kemdikbud.go.id/documents?search=${encodedQuery}`
    };
    
    // 7. Perpusnas e-Resources
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
