import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { createAdminRouter } from './routes/adminRoutes.js';
import { isLocalSharingActive, initLocalSharingState } from './controllers/adminController.js';
import authRoutes from './routes/authRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

const app = express();
const server = http.createServer(app);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Local Wi-Fi Network Disconnect Guard
app.use((req, res, next) => {
  // Always permit admin routes, health check, and socket.io
  if (
    req.path.startsWith('/api/v1/admin') ||
    req.path === '/admin' ||
    req.path === '/api/health' ||
    req.path.startsWith('/socket.io')
  ) {
    return next();
  }

  const clientIp = req.ip || req.connection?.remoteAddress || '';
  const isLocalhost =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp === '::ffff:127.0.0.1' ||
    req.hostname === 'localhost';

  if (isLocalhost) {
    return next();
  }

  // If local sharing is turned OFF, block access from external Wi-Fi devices
  if (!isLocalSharingActive()) {
    if (req.accepts('html')) {
      return res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Local Stream Disconnected</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6 text-center font-sans">
          <div class="max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl space-y-4 shadow-2xl">
            <div class="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto text-3xl border border-rose-500/20">
              🔌
            </div>
            <h2 class="text-2xl font-bold">Local Wi-Fi Stream Disconnected</h2>
            <p class="text-xs text-slate-400 leading-relaxed">The server administrator has temporarily disconnected access for local Wi-Fi router devices.</p>
            <div class="text-[11px] text-slate-500 font-mono">Status: OFFLINE ON LOCAL LAN</div>
          </div>
        </body>
        </html>
      `);
    }
    return res.status(503).json({
      error: 'Local Wi-Fi Network stream is currently disconnected by Administrator.'
    });
  }

  next();
});

// Serve Static Frontend Assets (User & Admin UI)
app.use(express.static(publicDir));

// Socket.io room handling for pairing
io.on('connection', (socket) => {
  socket.on('JOIN_PAIRING_ROOM', (roomName) => {
    socket.join(roomName);
    console.log(`[Socket] Device joined room: ${roomName}`);
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', createAdminRouter(io));
app.use('/api/v1/media', mediaRoutes);

// Frontend Routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    server: 'Local Stream Media Hub',
    time: new Date()
  });
});

// Helper to get local Wi-Fi IPv4 address
const getLocalWifiIp = () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
};

const PORT = process.env.PORT || 9086;
const HOST = process.env.HOST || '0.0.0.0';
const localIp = getLocalWifiIp();

const startServer = async () => {
  await connectDB();
  await initLocalSharingState();
  server.listen(PORT, HOST, () => {
    console.log(`\n============================================================`);
    console.log(`🎬 LOCAL STREAM SERVER IS RUNNING ON LOCAL WI-FI NETWORK:`);
    console.log(`------------------------------------------------------------`);
    console.log(`💻 User Portal:     http://localhost:${PORT}`);
    console.log(`⚙️  Admin Portal:    http://localhost:${PORT}/admin`);
    console.log(`📱 Wi-Fi Device:    http://${localIp}:${PORT}`);
    console.log(`============================================================\n`);
  });
};

startServer();
