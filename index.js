require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

app.get('/login', (req, res) => {
  const scope = 'user-read-playback-state user-modify-playback-state';
  const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    try {
      const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        grant_type: 'authorization_code'
      }), {
        headers: {
          Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
  
      const accessToken = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const identifier = crypto.randomBytes(5).toString('hex');
  
      await pool.query('INSERT INTO hosts (identifier, access_token, refresh_token) VALUES ($1, $2, $3)', [identifier, accessToken, refreshToken]);
  
      res.json({ identifier });
    } catch (error) {
      console.error("Spotify authentication error:", error);
      res.status(400).json({ error: 'Error al autenticar con Spotify' });
    }
  });
  

app.post('/add-song', async (req, res) => {
  const { identifier, songUri } = req.body;
  try {
    const result = await pool.query('SELECT access_token FROM hosts WHERE identifier = $1', [identifier]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Código no encontrado' });
    }
    const accessToken = result.rows[0].access_token;

    await axios.post('https://api.spotify.com/v1/me/player/queue', null, {
      params: { uri: songUri },
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.json({ message: 'Canción añadida a la cola' });
  } catch (error) {
    res.status(400).json({ error: 'Error al añadir canción' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
