import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import adminRouter from './admin.js';
import { registerHostClient, submitVote, notifyPlayerJoined, getGameStatus } from './game.js';
import { addPlayer, getPlayer, getPlayerCount } from './players.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

// Static files (built frontend)
app.use('/host', express.static(join(__dirname, '../dist/src/host')));
app.use('/player', express.static(join(__dirname, '../dist/src/player')));
app.use('/admin', express.static(join(__dirname, '../dist/src/admin')));
app.use('/assets', express.static(join(__dirname, '../dist/assets')));

// API routes
app.use('/api/admin', adminRouter);

// Player join
app.post('/api/join', (req, res) => {
  const { playerId, nickname } = req.body as { playerId: string; nickname: string };
  if (!playerId || !nickname) {
    res.status(400).json({ success: false, error: 'Missing playerId or nickname' });
    return;
  }

  const cleaned = (nickname ?? '').trim().slice(0, 10);
  if (!cleaned) {
    res.status(400).json({ success: false, error: 'Nickname cannot be empty' });
    return;
  }

  const existing = getPlayer(playerId);
  if (existing) {
    // Reconnect
    res.json({ success: true, player: existing });
    return;
  }

  const player = addPlayer(playerId, cleaned);
  notifyPlayerJoined(player.nickname);
  res.json({ success: true, player });
});

// Player vote
app.post('/api/vote', (req, res) => {
  const { playerId, choice } = req.body as { playerId: string; choice: number };
  if (!playerId || choice === undefined) {
    res.status(400).json({ success: false, reason: 'invalid_request' });
    return;
  }
  const result = submitVote(playerId, choice);
  if (result === true) {
    res.json({ success: true });
  } else {
    res.json({ success: false, reason: result });
  }
});

// Player status
app.get('/api/status', (req, res) => {
  const playerId = req.query.playerId as string;
  const player = playerId ? getPlayer(playerId) : undefined;
  const status = getGameStatus();
  res.json({ ...status, player: player ?? null });
});

// WebSocket for host/spectators
wss.on('connection', (ws) => {
  registerHostClient(ws);
});

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
