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
