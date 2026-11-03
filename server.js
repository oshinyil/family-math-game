import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Server } from 'socket.io';
import QRCode from 'qrcode';
import { Game } from './lib/game.js';
import { allowedRequest, isLoopback, joinUrls } from './lib/network.js';

const root = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 4096,
    allowRequest: (req, callback) => callback(null, allowedRequest(req)),
  });
  const identities = new Map();
  const game = new Game({ onChange: broadcast });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!allowedRequest(req)) return res.status(403).send('This game is only available on the local home network.');
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    next();
  });
  app.get('/host', (req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) return res.status(403).send(`Open http://localhost:${server.address().port}/host on the host PC.`);
    res.sendFile(path.join(root, 'views', 'host.html'));
  });
  app.get('/api/join', async (req, res, next) => {
    if (!isLoopback(req.socket.remoteAddress)) return res.sendStatus(403);
    try {
      const urls = joinUrls(server.address().port);
      const codes = await Promise.all(urls.map(url => QRCode.toDataURL(url, { width: 180, margin: 1 })));
      res.json({ urls, codes });
    } catch (error) { next(error); }
  });
  app.use(express.static(path.join(root, 'public')));
  app.use((error, req, res, next) => {
    console.error('Request failed:', error);
    if (res.headersSent) return next(error);
    res.status(500).send('The server could not complete that request. Check the host terminal.');
  });

  function broadcast() {
    for (const socket of io.sockets.sockets.values()) {
      const identity = identities.get(socket.id);
      if (identity && (!identity.player || game.players.has(identity.player.token))) {
        socket.emit('state', game.snapshot(identity.player));
      }
    }
  }

  io.on('connection', socket => {
    let messages = 0;
    const window = setInterval(() => { messages = 0; }, 1000);
    const action = (event, handler) => socket.on(event, (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (++messages > 50) return ack({ error: 'Too many actions. Please slow down.' });
      try { ack({ ok: true, ...handler(payload) }); }
      catch (error) {
        console.warn(`Game action "${event}" rejected:`, error instanceof Error ? error.message : error);
        ack({ error: error instanceof Error ? error.message : 'The action failed.' });
      }
    });
    action('host', () => {
      if (!isLoopback(socket.handshake.address)) throw new Error('Host controls are only available on the host PC.');
      if (identities.has(socket.id)) throw new Error('This browser is already connected.');
      identities.set(socket.id, { host: true });
      socket.emit('state', game.snapshot());
    });
    action('join', payload => {
      if (identities.has(socket.id)) throw new Error('This browser is already connected.');
      const player = game.join(payload ?? {});
      identities.set(socket.id, { player });
      game.connect(player, socket.id);
      return { token: player.token };
    });
    action('profile', payload => {
      const player = identities.get(socket.id)?.player;
      if (!player) throw new Error('Join the game first.');
      game.updateProfile(player, payload ?? {});
    });
    action('answer', payload => {
      const player = identities.get(socket.id)?.player;
      if (!player) throw new Error('Join the game first.');
      game.answer(player, payload ?? {});
    });
    for (const [event, handler] of Object.entries({
      start: payload => game.start(payload),
      next: () => game.next(),
      tiebreaker: () => game.tiebreaker(),
      lobby: () => game.lobby(),
      remove: payload => {
        const player = game.remove(payload?.id);
        for (const id of player.sockets) io.sockets.sockets.get(id)?.disconnect(true);
      },
    })) {
      action(event, payload => {
        if (!identities.get(socket.id)?.host) throw new Error('Only the host can do that.');
        handler(payload);
      });
    }
    socket.on('disconnect', () => {
      clearInterval(window);
      const player = identities.get(socket.id)?.player;
      identities.delete(socket.id);
      if (player) game.disconnect(player, socket.id);
    });
  });
  return { app, server, io, game, close: async () => {
    clearTimeout(game.timer);
    await new Promise(resolve => io.close(resolve));
  } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a number from 1 to 65535.');
  const { server } = createApp();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Close the other game or set PORT to another number.` : error);
    process.exitCode = 1;
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`\nFamily Math Club\nHost: http://localhost:${port}/host`);
    for (const url of joinUrls(port)) console.log(`Kids join: ${url}`);
    console.log('Keep this window open. Press Ctrl+C to stop.\n');
    if (process.argv.includes('--open') && process.platform === 'win32') {
      spawn('explorer.exe', [`http://localhost:${port}/host`], { stdio: 'ignore' })
        .on('error', error => console.error('Could not open your browser. Open the host URL above manually.', error.message));
    }
  });
}
