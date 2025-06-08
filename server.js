const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  const body = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      {
        role: "system",
        content: `Kamu adalah AbidinAI... (isi prompt kamu sendiri di sini)`
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

const path = require('path');
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Halaman alarm (alarm.html)
app.get('/alarm', (req, res) => {
  res.sendFile(path.join(__dirname, 'alarm.html'));
});

app.listen(PORT, () => console.log(`🚀 AbidinAI Server jalan di port ${PORT}`));
