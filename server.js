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
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 


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
// ... (Data dan Fungsi Aksara Jawa tidak diubah, dilewatkan untuk keringkasan)
// ...
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
    // ... (Keywords tidak diubah, dilewatkan untuk keringkasan)
    "bahasa jawa", "aksara jawa", "hanacaraka", "carakan", "sandhangan",
    "pangkon", "murda", "rekan", "swara", "pasangan", "transliterasi",
    "aksara legena", "aksara rekan", "aksara swara", "nulis aksara",
    "huruf jawa", "abjad jawa", "hanacaraka lengkap", "aksara ha na ca ra ka",
    "tata krama", "unggah ungguh", "pitutur luhur", "wejangan", "pepatah jawa",
    "falsafah jawa", "ajaran kejawen", "nilai luhur", "spiritual jawa", 
    "mistik jawa", "primbon", "weton", "pawukon", "neptu", "ramalan jawa",
    "budaya jawa", "adat jawa", "tradisi jawa", "upacara adat", 
    "mitos jawa", "kejawen", "ritual jawa", "sejarah jawa", "kerajaan jawa",
    "wayang", "gamelan", "karawitan", "campursari", "macapat", 
    "tembang", "geguritan", "serat", "babad", "puisi jawa", "sastra jawa",
    "sindhen", "dalang", "tembang dolanan", "langgam jawa",
    "batik", "lurik", "blangkon", "kebaya", "jarik", "keris", "tombak", 
    "ukiran jawa", "busana tradisional", "blangkon solo", "blangkon jogja",
    "majapahit", "singhasari", "kediri", "mataram", "panembahan senopati",
    "raden patah", "sunan kalijaga", "sunan kudus", "sunan muria",
    "kraton", "keraton", "mangkunegaran", "pakualaman", 
    "yogyakarta", "surakarta", "solo",
    "jawa tengah", "jawa timur", "jawa barat", "diy yogyakarta",
    "suku jawa", "tanah jawa", "bahasa krama", "bahasa ngoko", "madya",
    "prabowo subianto", 
    "tari jawa", "wayang orang", "ketoprak", "klenengan", "teater jawa",
    "pentas budaya", "sendratari", "srimpi", "bedhaya", "reog"
];


function isJavaneseTopic(message) {
    const lowerCaseMessage = message.toLowerCase();
    return javanese_keywords.some(keyword => lowerCaseMessage.includes(keyword));
}

// ==========================================================
// 🚀 SEMUA ENDPOINT API DITEMPATKAN DI AWAL
// ==========================================================

// ¨ ENDPOINT CHAT UTAMA ¨
app.post('/api/chat', async (req, res) => {
  const { message, system_prompt } = req.body;
  
  if (!message) {
      return res.status(400).json({ reply: "Pesan tidak boleh kosong." });
  }
  
  if (isJavaneseTopic(message) && process.env.GEMINI_API_KEY) {
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
          console.log("⚠️ Gagal di Gemini, Fallback ke Groq...");
      }
  }
  
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

Kamu adalah AbidinAI — asisten kecerdasan buatan yang sangat cerdas, cepat beradaptasi, dan berwawasan luas.  
Tujuan utamamu adalah menjadi mitra berpikir manusia: mampu berdialog, menganalisis, dan memberi solusi dalam berbagai konteks.  
... (Lanjutan prompt Groq disingkat untuk keringkasan)
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
        console.error("Groq API Error:", data.error);
        return res.status(500).json({ reply: `Error dari AI: ${data.error.message || 'Kesalahan tidak diketahui.'}` });
    }
    
    const reply = data.choices?.[0]?.message?.content || "Maaf, AI tidak memberikan balasan yang valid.";
    res.json({ reply });
    
  } catch (error) {
    console.error("Kesalahan Jaringan/Server Groq:", error);
    res.status(500).json({ reply: `Terjadi kesalahan pada server: ${error.message}` });
  }
});


// ¨ ENDPOINT TELEGRAM ¨
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


// 🚀 ENDPOINT OCR/MULTIMODAL DENGAN MULTI-UPLOAD (Hingga 5 Gambar) 🚀
// upload.array('images', 5) memastikan menerima hingga 5 file dengan field name 'images'
app.post('/api/ocr', upload.array('images', 5), async (req, res) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!req.files || req.files.length === 0) {
    console.log("❌ Error: Tidak ada file yang terdeteksi di req.files.");
    // Respons ini akan berupa JSON
    return res.status(400).json({ error: 'Minimal satu file gambar tidak ditemukan. Pastikan field name adalah "images".' });
  }

  // Tambahkan log untuk konfirmasi penerimaan file
  console.log(`✅ Menerima ${req.files.length} file untuk diproses.`);

  const abidinaiPrompt = `
  ANDA ADALAH: ABIDINAI — *Analis Multimodal Kontekstual Strategis*.  
  ... (Prompt Gemini disingkat untuk keringkasan)
  ...
  TOLONG INTEGRASIKAN ANALISIS SEMUA GAMBAR YANG DISEDIAKAN.
  `;

  // Membuat array 'parts' yang berisi prompt teks dan SEMUA file gambar
  const parts = [{ text: abidinaiPrompt }];

  req.files.forEach((file, index) => {
    parts.push({
        inlineData: {
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
  
  let response;
  let data;
  try {
    // Pastikan URL API Google dan API Key sudah benar
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    // Periksa status respons HTTP dari Google API
    if (!response.ok) {
        const errorText = await response.text();
        console.error("Google API HTTP Error:", response.status, errorText);
        // Respon server harus JSON
        return res.status(response.status).json({ error: 'Gagal dari Google API.', details: errorText });
    }

    data = await response.json();
    
    // Cek jika ada error di dalam JSON respons (seperti rate limit atau bad request)
    if (data.error) {
        console.error("Gemini API Error (JSON):", data.error);
        return res.status(500).json({ error: 'Gemini API Error', details: data.error.message });
    }
    
    const geminiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memahami isi gambar ini. Mohon coba lagi dengan gambar yang lebih jelas.";
    
    res.json({ reply: geminiReply });

  } catch (error) {
    console.error("Kesalahan Jaringan/Fatal pada /api/ocr:", error);
    // Jika ada error fatal, pastikan respon adalah JSON
    res.status(500).json({ error: 'Gagal menganalisis gambar karena kesalahan server internal.', details: error.message });
  }
});


// ¨ ENDPOINT RESEARCH ¨
app.post('/api/research', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query tidak ditemukan' });
    
    // ... (Logika research tidak diubah, dilewatkan untuk keringkasan)
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

    results.google_scholar = {
        message: "Akses jutaan artikel, tesis, dan kutipan. Klik tautan untuk melihat hasil pencarian lengkap.",
        search_link: `https://scholar.google.com/scholar?hl=en&q=${encodedQuery}`
    };

    results.doaj = {
        message: "Jurnal Akses Terbuka (Open Access) berkualitas tinggi yang terkurasi dan terjamin peer-review.",
        search_link: `https://doaj.org/search?source=%7B%22query%22%3A%7B%22query_string%22%3A%7B%22query%22%3A%22${encodedQuery}%22%7D%7D%7D`
    };

    results.pubmed_central = {
        message: "Sumber primer untuk riset biomedis dan ilmu kesehatan. Semua artikel di PMC bersifat gratis.",
        search_link: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodedQuery}&filter=pubt.pmc` 
    };

    results.garuda = {
        message: "Temukan publikasi ilmiah, jurnal, dan karya dari peneliti Indonesia.",
        search_link: `https://garuda.kemdikbud.go.id/documents?search=${encodedQuery}`
    };
    
    results.perpusnas_eresources = {
        message: "Akses legal dan gratis ke database premium internasional (ProQuest, EBSCO, dll.) dengan mendaftar anggota Perpusnas online.",
        info_link: 'https://e-resources.perpusnas.go.id/'
    };

    res.json(results);
});


// ¨ ENDPOINT UNLIMITED CHAT ¨
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


// ==========================================================
// 🧭 PENANGANAN ROUTE DAN FILE STATIS (Ditempatkan di Akhir)
// ==========================================================

// Melayani file statis dari direktori saat ini (penting untuk CSS/JS/Gambar)
app.use(express.static(path.join(__dirname))); 

// Routing untuk halaman HTML utama
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

// Fallback Terakhir untuk Rute yang Tidak Ditemukan
// Jika route POST/GET tidak cocok dengan API di atas dan bukan file statis,
// maka ini akan mengarahkan (redirect) ke halaman utama, yang bisa menyebabkan error JSON pada POST request
app.use((req, res) => {
    // Jika permintaan BUKAN POST (misalnya, pengguna mengetik URL yang salah), lakukan redirect.
    if (req.method === 'GET') {
        return res.redirect('/');
    }
    
    // Jika permintaan adalah POST ke rute yang tidak dikenal (ini yang menyebabkan error JSON),
    // Kirimkan respons JSON yang jelas.
    console.error(`❌ Permintaan POST ke rute tidak dikenal: ${req.originalUrl}`);
    return res.status(404).json({ error: `Endpoint tidak ditemukan: ${req.originalUrl}`, details: "Pastikan metode dan URL API sudah benar." });
});

app.listen(PORT, () => console.log(`🌐AbidinAI Server jalan di port ${PORT}`));
