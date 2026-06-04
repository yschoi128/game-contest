import { Router } from 'express';
import * as Game from './game.js';

const router = Router();

router.post('/start', (_req, res) => {
  const ok = Game.startGame();
  res.json({ success: ok });
});

router.post('/next', (req, res) => {
  const { choices } = req.body as { choices?: string[] };
  const ok = Game.advanceToNextRound(choices);
  res.json({ success: ok });
});

router.post('/pause', (_req, res) => {
  const paused = Game.togglePause();
  res.json({ paused });
});

router.post('/invalidate', (_req, res) => {
  const ok = Game.invalidateRound();
  res.json({ success: ok });
});

router.post('/end', (_req, res) => {
  Game.forceEnd();
  res.json({ success: true });
});

router.post('/reset', (_req, res) => {
  Game.resetGame();
  res.json({ success: true });
});

router.get('/status', (_req, res) => {
  res.json(Game.getGameStatus());
});

export default router;
