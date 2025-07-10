// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Serve uploads statically
app.use('/uploads', express.static(uploadDir));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    url: fileUrl,
    name: req.file.originalname,
    type: req.file.mimetype
  });
});

// Store connected users and messages
const users = {};
const messages = [];
const typingUsers = {};

// Static list of available rooms
const availableRooms = ['General', 'Tech', 'Random'];
// Track which users are in which rooms
const userRooms = {};

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (username) => {
    users[socket.id] = { username, id: socket.id };
    io.emit('user_list', Object.values(users));
    io.emit('user_joined', { username, id: socket.id });
    console.log(`${username} joined the chat`);
  });

  // Handle joining a room
  socket.on('join_room', (roomName) => {
    if (!availableRooms.includes(roomName)) return;
    // Leave previous room if any
    if (userRooms[socket.id]) {
      socket.leave(userRooms[socket.id]);
      // Notify users in the old room
      io.to(userRooms[socket.id]).emit('user_list', getUsersInRoom(userRooms[socket.id]));
    }
    socket.join(roomName);
    userRooms[socket.id] = roomName;
    // Notify users in the new room
    io.to(roomName).emit('user_list', getUsersInRoom(roomName));
    socket.emit('joined_room', roomName);
  });

  // Handle leaving a room
  socket.on('leave_room', () => {
    const room = userRooms[socket.id];
    if (room) {
      socket.leave(room);
      delete userRooms[socket.id];
      io.to(room).emit('user_list', getUsersInRoom(room));
    }
  });

  // Handle chat messages (now with room)
  socket.on('send_message', (messageData) => {
    const room = messageData.room || userRooms[socket.id] || 'General';
    const message = {
      ...messageData,
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
      room,
    };
    messages.push(message);
    if (messages.length > 100) messages.shift();
    io.to(room).emit('receive_message', message);
    // Removed socket.emit('receive_message', message) to avoid duplicate messages
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    if (users[socket.id]) {
      const username = users[socket.id].username;
      
      if (isTyping) {
        typingUsers[socket.id] = username;
      } else {
        delete typingUsers[socket.id];
      }
      
      io.emit('typing_users', Object.values(typingUsers));
    }
  });

  // Handle private messages
  socket.on('private_message', ({ to, message }) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };
    // Create a unique private room for the two users
    const privateRoom = [socket.id, to].sort().join('-');
    socket.join(privateRoom);
    io.sockets.sockets.get(to)?.join(privateRoom);
    io.to(privateRoom).emit('private_message', messageData);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { username } = users[socket.id];
      io.emit('user_left', { username, id: socket.id });
      console.log(`${username} left the chat`);
    }
    
    delete users[socket.id];
    delete typingUsers[socket.id];
    
    io.emit('user_list', Object.values(users));
    io.emit('typing_users', Object.values(typingUsers));

    // On disconnect, remove user from room
    const room = userRooms[socket.id];
    if (room) {
      socket.leave(room);
      delete userRooms[socket.id];
      io.to(room).emit('user_list', getUsersInRoom(room));
    }
  });
});

// Helper to get users in a room
function getUsersInRoom(room) {
  return Object.entries(userRooms)
    .filter(([id, r]) => r === room)
    .map(([id]) => users[id])
    .filter(Boolean);
}

// API routes
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// API route to get available rooms
app.get('/api/rooms', (req, res) => {
  res.json(availableRooms);
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io }; 