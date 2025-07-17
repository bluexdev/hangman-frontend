// server/voice-signaling.js
const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const cors = require('cors')

const app = express()
const server = http.createServer(app)

app.use(cors())
app.use(express.json())

// Almacenar conexiones por room
const rooms = new Map()

// WebSocket server para signaling
const wss = new WebSocket.Server({ 
  server,
  path: '/voice',
  perMessageDeflate: false
})

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection')
  
  let currentRoom = null
  let userId = null

ws.on('message', (message) => {
  try {
    console.log('[WS] Mensaje recibido:', message);
    const data = JSON.parse(message)
    console.log('[WS] Tipo de mensaje:', data.type, '| Contenido:', data);
    switch (data.type) {
      case 'join':
        handleJoinRoom(ws, data)
        break
      case 'offer':
      case 'answer':
      case 'ice-candidate':
        handleSignalingMessage(ws, data)
        break
      case 'leave':
        handleLeaveRoom(ws)
        break
      default:
        console.warn('[WS] Tipo de mensaje desconocido:', data.type);
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }))
    }
  } catch (error) {
    console.error('[WS] Error procesando mensaje:', error, '| Mensaje bruto:', message)
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
  }
})

  ws.on('close', () => {
    console.log('WebSocket connection closed')
    handleLeaveRoom(ws)
  })

  ws.on('error', (error) => {
    console.error('WebSocket error:', error)
  })

  function handleJoinRoom(ws, data) {
    const { roomId, userId: userIdFromClient } = data
    console.log('[WS] handleJoinRoom | roomId:', roomId, '| userId:', userIdFromClient);
    if (!roomId || !userIdFromClient) {
      console.warn('[WS] Faltan roomId o userId en join:', data);
      ws.send(JSON.stringify({ type: 'error', message: 'Room ID and User ID required' }))
      return
    }

    currentRoom = roomId
    userId = userIdFromClient

    // Crear room si no existe
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map())
      console.log('[WS] Nueva sala creada:', roomId);
    }

    const room = rooms.get(roomId)

    // Agregar usuario al room
    room.set(userId, {
      ws,
      userId,
      joinedAt: new Date()
    })

    console.log(`[WS] User ${userId} joined room ${roomId}. Room size: ${room.size}`)

    // Notificar que se unió exitosamente
    ws.send(JSON.stringify({ 
      type: 'joined', 
      roomId, 
      userId,
      roomSize: room.size
    }))

    // Notificar a otros usuarios en la room
    broadcastToRoom(roomId, {
      type: 'user-joined',
      userId,
      roomSize: room.size
    }, userId)
  }

  function handleSignalingMessage(ws, data) {
    const { roomId, targetUserId } = data
    
    if (!roomId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }))
      return
    }

    const room = rooms.get(roomId)
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }))
      return
    }

    // Si hay un targetUserId específico, enviar solo a ese usuario
    if (targetUserId) {
      const targetUser = room.get(targetUserId)
      if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
        targetUser.ws.send(JSON.stringify({
          ...data,
          fromUserId: userId
        }))
      }
    } else {
      // Enviar a todos los demás usuarios en la room
      broadcastToRoom(roomId, {
        ...data,
        fromUserId: userId
      }, userId)
    }
  }

  function handleLeaveRoom(ws) {
    if (currentRoom && userId) {
      const room = rooms.get(currentRoom)
      if (room) {
        room.delete(userId)
        
        console.log(`User ${userId} left room ${currentRoom}. Room size: ${room.size}`)
        
        // Notificar a otros usuarios
        broadcastToRoom(currentRoom, {
          type: 'user-left',
          userId,
          roomSize: room.size
        }, userId)
        
        // Eliminar room si está vacía
        if (room.size === 0) {
          rooms.delete(currentRoom)
          console.log(`Room ${currentRoom} deleted (empty)`)
        }
      }
    }
  }
})

// Función para enviar mensaje a todos los usuarios en una room excepto el emisor
function broadcastToRoom(roomId, message, excludeUserId = null) {
  const room = rooms.get(roomId)
  if (!room) return

  room.forEach((user, userId) => {
    if (userId !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(JSON.stringify(message))
    }
  })
}

// Endpoint para obtener información de rooms (opcional, para debugging)
app.get('/api/rooms', (req, res) => {
  const roomsInfo = Array.from(rooms.entries()).map(([roomId, users]) => ({
    roomId,
    userCount: users.size,
    users: Array.from(users.keys())
  }))
  
  res.json(roomsInfo)
})

// Endpoint para obtener información de una room específica
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params
  const room = rooms.get(roomId)
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' })
  }
  
  res.json({
    roomId,
    userCount: room.size,
    users: Array.from(room.keys())
  })
})

// Limpiar rooms inactivas cada 30 minutos
setInterval(() => {
  const now = new Date()
  const maxAge = 30 * 60 * 1000 // 30 minutos
  
  rooms.forEach((room, roomId) => {
    const activeUsers = new Map()
    
    room.forEach((user, userId) => {
      if (user.ws.readyState === WebSocket.OPEN) {
        activeUsers.set(userId, user)
      }
    })
    
    if (activeUsers.size === 0) {
      rooms.delete(roomId)
      console.log(`Cleaned up empty room: ${roomId}`)
    } else {
      rooms.set(roomId, activeUsers)
    }
  })
}, 30 * 60 * 1000)

const PORT = process.env.VOICE_SERVER_PORT || 3001

server.listen(PORT, () => {
  console.log(`🎙️ Voice signaling server running on port ${PORT}`)
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/voice`)
})

module.exports = { app, server }