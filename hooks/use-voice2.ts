// hooks/use-voice.ts
import { useState, useRef, useCallback, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase'
import { useToast } from '@/components/ui/use-toast'
import { VOICE_CONFIG, getVoiceErrorMessage, checkWebRTCSupport } from '@/lib/voice-config'

interface UseVoiceReturn {
  startRecording: () => Promise<void>
  stopRecording: () => void
  isRecording: boolean
  isConnecting: boolean
  error: string | null
  isConnected: boolean
}

export default function useVoice(roomId: string, userId: string): UseVoiceReturn {
  console.log('[useVoice] INIT', { roomId, userId });
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roomSize, setRoomSize] = useState<number | null>(null)
  const [isInitiator, setIsInitiator] = useState(false)
  
  const { toast } = useToast()
  const supabase = createBrowserClient()
  
  // Referencias para WebRTC
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isCleaningUpRef = useRef(false)
  const isMountedRef = useRef(true)
  
  // Configuración WebRTC
  const rtcConfig = VOICE_CONFIG.RTC_CONFIG

  // Verificar soporte WebRTC al inicializar
  useEffect(() => {
    if (!checkWebRTCSupport()) {
      setError('Tu navegador no soporta llamadas de voz')
      toast({
        title: "Navegador no compatible",
        description: "Tu navegador no soporta llamadas de voz. Usa Chrome, Firefox o Edge.",
        variant: "destructive",
      })
    }
  }, [toast])

  // Inicializar audio remoto
  useEffect(() => {
    if (!remoteAudioRef.current) {
      remoteAudioRef.current = new Audio()
      remoteAudioRef.current.autoplay = true
    }
  }, [])

  // Función para obtener stream local con mejor manejo de errores
  const getLocalStream = useCallback(async () => {
    try {
      // Si ya tenemos un stream y está activo, devolverlo
      if (localStreamRef.current && localStreamRef.current.active) {
        return localStreamRef.current
      }

      // Limpiar stream anterior si existe pero no está activo
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop()
        })
        localStreamRef.current = null
      }
      
      console.log('[VOICE] Solicitando nuevo stream local...')
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONFIG.AUDIO_CONSTRAINTS)
      
      // Verificar que el componente sigue montado
      if (!isMountedRef.current) {
        stream.getTracks().forEach(track => track.stop())
        throw new Error('Component unmounted during stream creation')
      }
      
      localStreamRef.current = stream
      console.log('[VOICE] Stream local obtenido exitosamente', stream)
      
      // Escuchar eventos del stream
      stream.getTracks().forEach(track => {
        track.addEventListener('ended', () => {
          console.log('[VOICE] Track terminado:', track.kind)
          if (isMountedRef.current) {
            setIsRecording(false)
          }
        })
      })
      
      return stream
    } catch (err) {
      console.error('[VOICE] Error obteniendo stream local:', err)
      
      // Limpiar stream parcial si existe
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      
      throw err
    }
  }, [])

  // Función mejorada para limpiar recursos
  const cleanup = useCallback(() => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true
    
    console.log('[VOICE] Iniciando limpieza de recursos...')
    
    try {
      // Detener grabación y limpiar stream local
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          console.log('[VOICE] Deteniendo track:', track.kind, track.readyState)
          track.stop()
        })
        localStreamRef.current = null
      }
      
      // Cerrar peer connection
      if (peerConnectionRef.current) {
        console.log('[VOICE] Cerrando peer connection...')
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      
      // Cerrar WebSocket
      if (socketRef.current) {
        console.log('[VOICE] Cerrando WebSocket...')
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.close(1000, 'Cleaning up')
        }
        socketRef.current = null
      }
      
      // Limpiar audio remoto
      if (remoteAudioRef.current) {
        try {
          remoteAudioRef.current.pause()
          remoteAudioRef.current.srcObject = null
          remoteAudioRef.current.src = ''
        } catch (e) {
          console.warn('[VOICE] Error limpiando audio remoto:', e)
        }
      }
      
      // Limpiar timeout de reconexión
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // Resetear estados solo si el componente sigue montado
      if (isMountedRef.current) {
        setIsConnected(false)
        setIsConnecting(false)
        setIsRecording(false)
        setError(null)
      }
      
      reconnectAttemptsRef.current = 0
      
    } catch (err) {
      console.error('[VOICE] Error durante limpieza:', err)
    }
    
    // Permitir nueva limpieza después de un breve delay
    setTimeout(() => {
      isCleaningUpRef.current = false
    }, 100)
  }, [])

  // Función de reconexión mejorada
  const attemptReconnect = useCallback(() => {
    if (isCleaningUpRef.current || !isMountedRef.current) return
    
    if (reconnectAttemptsRef.current < VOICE_CONFIG.RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current++
      console.log(`[VOICE] Intento de reconexión ${reconnectAttemptsRef.current}/${VOICE_CONFIG.RECONNECT_ATTEMPTS}`)
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && !isCleaningUpRef.current) {
          connectSignaling()
        }
      }, VOICE_CONFIG.RECONNECT_DELAY * reconnectAttemptsRef.current)
    } else {
      console.error('[VOICE] Se agotaron los intentos de reconexión')
      if (isMountedRef.current) {
        setError('No se pudo conectar al servidor de voz después de varios intentos')
        toast({
          title: "Error de conexión",
          description: "No se pudo establecer conexión con el servidor de voz",
          variant: "destructive",
        })
      }
    }
  }, [toast])

  // Función para manejar errores de WebSocket
  const handleWebSocketError = useCallback((error: Event, context: string) => {
    console.error(`[VOICE] WebSocket error en ${context}:`, error)
    
    if (!isMountedRef.current || isCleaningUpRef.current) return
    
    // Forzar limpieza del socket problemático
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    
    setError(`Error de conexión de voz: ${context}`)
    setIsConnected(false)
    
    // Intentar reconectar después de un breve delay
    setTimeout(() => {
      if (isMountedRef.current && !isCleaningUpRef.current) {
        attemptReconnect()
      }
    }, 1000)
  }, [attemptReconnect])

  // Conectar al signaling server con mejor manejo de errores
  const connectSignaling = useCallback(() => {
    if (isCleaningUpRef.current || !isMountedRef.current) return
    
    console.log('[VOICE] Conectando al signaling server...', { roomId, userId })
    
    try {
      // Cerrar conexión existente si existe
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      
      const wsUrl = `${VOICE_CONFIG.SIGNALING_SERVER_URL}/voice`
      console.log('[VOICE] URL WebSocket:', wsUrl)
      
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket
      
      // Timeout para la conexión
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error('[VOICE] Timeout de conexión WebSocket')
          socket.close()
          handleWebSocketError(new Event('timeout'), 'connection timeout')
        }
      }, 10000)
      
      socket.onopen = () => {
        clearTimeout(connectionTimeout)
        
        if (isCleaningUpRef.current || !isMountedRef.current) {
          socket.close()
          return
        }
        
        console.log('[VOICE] ✅ Conectado al signaling server')
        
        try {
          // Enviar mensaje de join al conectar
          socket.send(JSON.stringify({
            type: 'join',
            roomId,
            userId
          }))
          
          setIsConnected(true)
          setError(null)
          reconnectAttemptsRef.current = 0
        } catch (err) {
          console.error('[VOICE] Error enviando mensaje join:', err)
          handleWebSocketError(new Event('send_error'), 'join message')
        }
      }
      
      socket.onmessage = async (event) => {
        if (isCleaningUpRef.current || !isMountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          await handleSignalingMessage(data)
        } catch (err) {
          console.error('[VOICE] Error procesando mensaje:', err)
          handleWebSocketError(new Event('message_error'), 'message parsing')
        }
      }
      
      socket.onclose = (event) => {
        clearTimeout(connectionTimeout)
        
        if (isCleaningUpRef.current || !isMountedRef.current) return
        
        console.log('[VOICE] WebSocket cerrado:', event.code, event.reason)
        setIsConnected(false)
        
        // Solo intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && event.code !== 1001) {
          attemptReconnect()
        }
      }
      
      socket.onerror = (error) => {
        clearTimeout(connectionTimeout)
        handleWebSocketError(error, 'socket error')
      }
      
    } catch (err) {
      console.error('[VOICE] Error creando WebSocket:', err)
      handleWebSocketError(new Event('creation_error'), 'socket creation')
    }
  }, [roomId, userId, attemptReconnect, handleWebSocketError])

  // Limpiar al desmontar componente
  useEffect(() => {
    isMountedRef.current = true
    
    return () => {
      isMountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  // Conectar al signaling server al montar el componente
  useEffect(() => {
    if (roomId && userId && isMountedRef.current) {
      connectSignaling()
    }
  }, [roomId, userId, connectSignaling])

  // Manejar mensajes del signaling server con mejor manejo de errores
  const handleSignalingMessage = async (data: any) => {
    if (isCleaningUpRef.current || !isMountedRef.current) return

    try {
      console.log('[SIGNALING] Mensaje recibido:', data.type)
      
      switch (data.type) {
        case 'joined': {
          setRoomSize(data.roomSize)
          if (data.roomSize === 1) {
            setIsInitiator(true)
            console.log('[SIGNALING] Soy el iniciador de la sala')
          } else {
            setIsInitiator(false)
            console.log('[SIGNALING] Soy el receptor de la sala')
          }
          break
        }
        
        case 'offer': {
          console.log('[SIGNALING] Procesando oferta...')
          
          try {
            // Obtener stream local si no existe
            const localStream = await getLocalStream()
            
            // Crear peer connection si no existe
            if (!peerConnectionRef.current) {
              console.log('[SIGNALING] Creando peerConnection para responder oferta')
              createPeerConnection()
            }
            
            const peerConnection = peerConnectionRef.current!
            
            // Verificar estado antes de procesar la oferta
            if (peerConnection.signalingState !== 'stable') {
              console.warn('[SIGNALING] PeerConnection no está en estado stable:', peerConnection.signalingState)
              // Resetear si es necesario
              if (peerConnection.signalingState === 'have-local-offer') {
                console.log('[SIGNALING] Reseteando peerConnection...')
                peerConnection.close()
                peerConnectionRef.current = null
                createPeerConnection()
              }
            }
            
            // Agregar stream local al peer connection ANTES de procesar la oferta
            localStream.getTracks().forEach(track => {
              const sender = peerConnection.getSenders().find(s => s.track === track)
              if (!sender) {
                peerConnection.addTrack(track, localStream)
                console.log('[SIGNALING] Track local agregado al peer connection del receptor')
              }
            })
            
            // Procesar la oferta
            await peerConnection.setRemoteDescription(data.offer)
            console.log('[SIGNALING] Oferta establecida como remoteDescription')
            
            // Crear y enviar respuesta
            const answer = await peerConnection.createAnswer()
            await peerConnection.setLocalDescription(answer)
            
            sendSignalingMessage({
              type: 'answer',
              answer: answer,
              roomId
            })
            
            console.log('[SIGNALING] Respuesta creada y enviada')
            
            // Marcar como grabando ya que tenemos el stream
            setIsRecording(true)
            
          } catch (err) {
            console.error('[SIGNALING] Error procesando oferta:', err)
            setError('Error al procesar la oferta de voz')
            
            // Limpiar recursos problemáticos
            if (peerConnectionRef.current) {
              peerConnectionRef.current.close()
              peerConnectionRef.current = null
            }
          }
          break
        }
          
        case 'answer': {
          console.log('[SIGNALING] Procesando respuesta...')
          if (peerConnectionRef.current && peerConnectionRef.current.signalingState === 'have-local-offer') {
            try {
              await peerConnectionRef.current.setRemoteDescription(data.answer)
              console.log('[SIGNALING] Respuesta establecida como remoteDescription')
            } catch (err) {
              console.error('[SIGNALING] Error estableciendo respuesta:', err)
              setError('Error al establecer conexión de voz')
            }
          }
          break
        }
          
        case 'ice-candidate': {
          console.log('[SIGNALING] Procesando ICE candidate...')
          if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
            try {
              await peerConnectionRef.current.addIceCandidate(data.candidate)
              console.log('[SIGNALING] ICE candidate agregado')
            } catch (err) {
              console.error('[SIGNALING] Error agregando ICE candidate:', err)
            }
          }
          break
        }
          
        case 'user-joined':
          if (typeof data.roomSize === 'number') setRoomSize(data.roomSize)
          console.log('[SIGNALING] Usuario se unió:', data.userId, 'Tamaño sala:', data.roomSize)
          break
          
        case 'user-left':
          console.log('[SIGNALING] Usuario salió:', data.userId)
          break
          
        case 'error':
          console.error('[SIGNALING] Error del servidor:', data.message)
          setError(data.message || 'Error del servidor de voz')
          break
      }
    } catch (err) {
      console.error('[SIGNALING] Error manejando mensaje:', err)
      setError('Error en la comunicación de voz')
    }
  }

  // Enviar mensaje al signaling server con mejor manejo de errores
  const sendSignalingMessage = (message: any) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[SIGNALING] No se puede enviar mensaje - WebSocket no conectado')
      return
    }
    
    try {
      console.log('[SIGNALING] Enviando mensaje:', message.type)
      socketRef.current.send(JSON.stringify(message))
    } catch (err) {
      console.error('[SIGNALING] Error enviando mensaje:', err)
      handleWebSocketError(new Event('send_error'), 'sending message')
    }
  }

  // Crear conexión peer-to-peer con mejor manejo de errores
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current

    try {
      const peerConnection = new RTCPeerConnection(rtcConfig)
      console.log('[VOICE] PeerConnection creada')

      // Manejar stream remoto
      peerConnection.ontrack = (event) => {
        console.log('[VOICE] Stream remoto recibido')
        if (remoteAudioRef.current && event.streams[0]) {
          remoteAudioRef.current.srcObject = event.streams[0]
          
          // Reproducir audio remoto con mejor manejo de errores
          const playRemoteAudio = async () => {
            try {
              await remoteAudioRef.current?.play()
              console.log('[VOICE] Audio remoto reproduciéndose')
            } catch (err) {
              console.warn('[VOICE] Error reproduciendo audio remoto:', err)
              
              // Intentar reproducir con interacción del usuario
              const playOnInteraction = async () => {
                try {
                  await remoteAudioRef.current?.play()
                  console.log('[VOICE] Audio remoto reproduciéndose tras interacción')
                } catch (e) {
                  console.error('[VOICE] Error reproduciendo tras interacción:', e)
                }
                document.removeEventListener('click', playOnInteraction)
                document.removeEventListener('touchstart', playOnInteraction)
              }
              
              document.addEventListener('click', playOnInteraction, { once: true })
              document.addEventListener('touchstart', playOnInteraction, { once: true })
            }
          }
          
          playRemoteAudio()
        }
      }

      // Manejar ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[VOICE] ICE candidate generado')
          sendSignalingMessage({
            type: 'ice-candidate',
            candidate: event.candidate,
            roomId
          })
        }
      }

      // Manejar cambios de estado
      peerConnection.onconnectionstatechange = () => {
        console.log('[VOICE] Estado de conexión:', peerConnection.connectionState)

        if (!isMountedRef.current) return

        switch (peerConnection.connectionState) {
          case 'connected':
            console.log('[VOICE] ✅ Conexión P2P establecida')
            setIsConnecting(false)
            setError(null)
            break
          case 'disconnected':
            console.log('[VOICE] ⚠️ Conexión P2P desconectada')
            setError('Se perdió la conexión de voz')
            break
          case 'failed':
            console.log('[VOICE] ❌ Conexión P2P falló')
            setError('Falló la conexión de voz')
            // Intentar limpiar y reconectar
            setTimeout(() => {
              if (isMountedRef.current) {
                cleanup()
                connectSignaling()
              }
            }, 2000)
            break
          case 'closed':
            console.log('[VOICE] 🔒 Conexión P2P cerrada')
            setIsConnecting(false)
            break
        }
      }

      peerConnection.oniceconnectionstatechange = () => {
        console.log('[VOICE] Estado ICE:', peerConnection.iceConnectionState)

        if (!isMountedRef.current) return

        switch (peerConnection.iceConnectionState) {
          case 'connected':
          case 'completed':
            console.log('[VOICE] ✅ ICE connection establecida')
            break
          case 'failed':
            console.log('[VOICE] ❌ ICE connection falló')
            try {
              peerConnection.restartIce()
            } catch (err) {
              console.error('[VOICE] Error reiniciando ICE:', err)
            }
            break
          case 'disconnected':
            console.log('[VOICE] ⚠️ ICE connection desconectada')
            break
        }
      }

      peerConnectionRef.current = peerConnection
      return peerConnection
    } catch (err) {
      console.error('[VOICE] Error creando PeerConnection:', err)
      throw err
    }
  }, [roomId, cleanup, connectSignaling])

  // Iniciar grabación con mejor manejo de errores
  const startRecording = useCallback(async () => {
    if (isCleaningUpRef.current || !isMountedRef.current) return

    try {
      console.log('[VOICE] Iniciando grabación...')
      setIsConnecting(true)
      setError(null)

      // Verificar si ya estamos grabando
      if (isRecording) {
        console.log('[VOICE] Ya estamos grabando')
        setIsConnecting(false)
        return
      }

      // Obtener stream del micrófono
      const stream = await getLocalStream()
      console.log('[VOICE] Stream local obtenido para grabación')

      // Crear o obtener peer connection
      const peerConnection = createPeerConnection()

      // Agregar stream local al peer connection
      stream.getTracks().forEach(track => {
        const sender = peerConnection.getSenders().find(s => s.track === track)
        if (!sender) {
          peerConnection.addTrack(track, stream)
          console.log('[VOICE] Track local agregado al peer connection')
        }
      })

      // Solo el iniciador puede crear y enviar la oferta
      if (isInitiator && peerConnection.signalingState === 'stable') {
        console.log('[VOICE] Creando oferta como iniciador')
        
        try {
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)
          
          sendSignalingMessage({
            type: 'offer',
            offer: offer,
            roomId
          })
          
          console.log('[VOICE] Oferta enviada')
        } catch (err) {
          console.error('[VOICE] Error creando oferta:', err)
          throw err
        }
      }

      setIsRecording(true)
      setIsConnecting(false)
      console.log('[VOICE] ✅ Grabación iniciada exitosamente')

    } catch (err) {
      console.error('[VOICE] Error iniciando grabación:', err)
      
      // Limpiar recursos en caso de error
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
      
      const errorMessage = getVoiceErrorMessage(err)
      setError(errorMessage)
      setIsConnecting(false)
      setIsRecording(false)

      if (isMountedRef.current) {
        toast({
          title: "Error de audio",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
  }, [createPeerConnection, roomId, toast, isRecording, isInitiator, getLocalStream])

  // Detener grabación con mejor limpieza
  const stopRecording = useCallback(() => {
    console.log('[VOICE] Deteniendo grabación...')
    
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          console.log('[VOICE] Deteniendo track:', track.kind)
          track.stop()
        })
        localStreamRef.current = null
      }
      
      setIsRecording(false)
      setError(null)
      console.log('[VOICE] ✅ Grabación detenida')
    } catch (err) {
      console.error('[VOICE] Error deteniendo grabación:', err)
    }
  }, [])

  return {
    startRecording,
    stopRecording,
    isRecording,
    isConnecting,
    error,
    isConnected
  }
}