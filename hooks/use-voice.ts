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

  // Función para obtener stream local
  const getLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_CONFIG.AUDIO_CONSTRAINTS)
      localStreamRef.current = stream
      console.log('[VOICE] Stream local obtenido', stream)
      return stream
    } catch (err) {
      console.error('Error obteniendo stream local:', err)
      throw err
    }
  }, [])

  // Limpiar recursos
  const cleanup = useCallback(() => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true
    
    console.log('Cleaning up voice resources...')
    
    // Detener grabación
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      localStreamRef.current = null
    }
    
    // Cerrar peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    // Cerrar WebSocket
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    
    // Limpiar audio remoto
    if (remoteAudioRef.current) {
      try {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      } catch (e) {}
    }
    
    // Limpiar timeout de reconexión
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    setIsConnected(false)
    setIsConnecting(false)
    setIsRecording(false)
    reconnectAttemptsRef.current = 0
    
    setTimeout(() => {
      isCleaningUpRef.current = false
    }, 100)
  }, [])

  // Función de reconexión
  const attemptReconnect = useCallback(() => {
    if (isCleaningUpRef.current) return
    
    if (reconnectAttemptsRef.current < VOICE_CONFIG.RECONNECT_ATTEMPTS) {
      reconnectAttemptsRef.current++
      console.log(`Reconnecting... attempt ${reconnectAttemptsRef.current}`)
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connectSignaling()
      }, VOICE_CONFIG.RECONNECT_DELAY * reconnectAttemptsRef.current)
    } else {
      setError('No se pudo conectar al servidor de voz después de varios intentos')
      toast({
        title: "Error de conexión",
        description: "No se pudo establecer conexión con el servidor de voz",
        variant: "destructive",
      })
    }
  }, [toast])

  // Conectar al signaling server
  const connectSignaling = useCallback(() => {
    if (isCleaningUpRef.current) return
    console.log('[useVoice] connectSignaling called', { roomId, userId });
    try {
      // Cerrar conexión existente si existe
      if (socketRef.current) {
        socketRef.current.close()
      }
      const wsUrl = `${VOICE_CONFIG.SIGNALING_SERVER_URL}/voice`
      console.log('[useVoice] Connecting to signaling server:', wsUrl, { roomId, userId })
      socketRef.current = new WebSocket(wsUrl)
      
      socketRef.current.onopen = () => {
        if (isCleaningUpRef.current) return
        
        console.log('Connected to signaling server')
        
        // Enviar mensaje de join al conectar
        socketRef.current?.send(JSON.stringify({
          type: 'join',
          roomId,
          userId
        }))
        
        setIsConnected(true)
        setError(null)
        reconnectAttemptsRef.current = 0
      }
      
      socketRef.current.onmessage = async (event) => {
        if (isCleaningUpRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          await handleSignalingMessage(data)
        } catch (err) {
          console.error('Error parsing signaling message:', err)
        }
      }
      
      socketRef.current.onclose = (event) => {
        if (isCleaningUpRef.current) return
        
        console.log('Disconnected from signaling server', event.code, event.reason)
        setIsConnected(false)
        
        // Solo intentar reconectar si no fue un cierre intencional
        if (event.code !== 1000 && !isCleaningUpRef.current) {
          attemptReconnect()
        }
      }
      
      socketRef.current.onerror = (error) => {
        if (isCleaningUpRef.current) return
        
        console.error('WebSocket error:', error)
        setError('Error de conexión de voz')
        
        // Intentar reconectar después de un error
        attemptReconnect()
      }
      
    } catch (err) {
      console.error('Error connecting to signaling server:', err)
      setError('No se pudo conectar al servidor de voz')
      attemptReconnect()
    }
  }, [roomId, userId, attemptReconnect])

  // Conectar al signaling server al montar el componente
  useEffect(() => {
    if (roomId && userId) {
      connectSignaling()
    }

    return cleanup
  }, [roomId, userId, connectSignaling, cleanup])

  // Manejar mensajes del signaling server
  const handleSignalingMessage = async (data: any) => {
    if (isCleaningUpRef.current) return

    try {
      console.log('[SIGNALING] Mensaje recibido:', data)
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
        case 'offer':
          console.log('[SIGNALING] Oferta recibida', data.offer)
          
          // CAMBIO CLAVE: Asegurarse de que el receptor tenga su stream local antes de responder
          try {
            // Obtener stream local si no existe
            const localStream = await getLocalStream()
            
            // Crear peer connection si no existe
            if (!peerConnectionRef.current) {
              console.log('[SIGNALING] Creando peerConnection para responder oferta')
              createPeerConnection()
            }
            
            const peerConnection = peerConnectionRef.current!
            
            // Agregar stream local al peer connection ANTES de procesar la oferta
            localStream.getTracks().forEach(track => {
              const sender = peerConnection.getSenders().find(s => s.track === track)
              if (!sender) {
                peerConnection.addTrack(track, localStream)
                console.log('[SIGNALING] Track local agregado al peer connection del receptor', track)
              }
            })
            
            // Verificar estado antes de procesar la oferta
            if (peerConnection.signalingState === 'have-remote-offer' || 
                peerConnection.signalingState === 'have-local-offer') {
              console.warn('[SIGNALING] Ya hay una oferta en curso, ignorando nueva oferta')
              break
            }
            
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
            
            console.log('[SIGNALING] Respuesta creada y enviada', answer)
            
            // Marcar como grabando ya que tenemos el stream
            setIsRecording(true)
            
          } catch (err) {
            console.error('[SIGNALING] Error procesando oferta:', err)
            setError('Error al procesar la oferta de voz')
          }
          break
          
        case 'answer':
          console.log('[SIGNALING] Respuesta recibida', data.answer)
          if (peerConnectionRef.current && peerConnectionRef.current.signalingState === 'have-local-offer') {
            await peerConnectionRef.current.setRemoteDescription(data.answer)
            console.log('[SIGNALING] Respuesta establecida como remoteDescription')
          }
          break
          
        case 'ice-candidate':
          console.log('[SIGNALING] ICE candidate recibido', data.candidate)
          if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(data.candidate)
            console.log('[SIGNALING] ICE candidate agregado')
          } else {
            console.log('[SIGNALING] ICE candidate guardado para más tarde')
          }
          break
          
        case 'user-joined':
          if (typeof data.roomSize === 'number') setRoomSize(data.roomSize)
          console.log('[SIGNALING] Otro usuario se unió a la sala:', data.userId, 'Tamaño sala:', data.roomSize)
          break
          
        case 'user-left':
          console.log('[SIGNALING] Usuario salió de la sala:', data.userId)
          break
      }
    } catch (err) {
      console.error('Error handling signaling message:', err)
      setError('Error en la comunicación de voz')
    }
  }

  // Enviar mensaje al signaling server
  const sendSignalingMessage = (message: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('[SIGNALING] Enviando mensaje:', message)
      socketRef.current.send(JSON.stringify(message))
    } else {
      console.warn('Cannot send signaling message - WebSocket not connected')
    }
  }

  // Crear conexión peer-to-peer
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current

    const peerConnection = new RTCPeerConnection(rtcConfig)
    console.log('[VOICE] PeerConnection creada')

    // Manejar stream remoto
    peerConnection.ontrack = (event) => {
      console.log('[VOICE] ontrack: Recibido stream remoto', event.streams, event.track)
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0]
        console.log('[VOICE] Audio remoto asignado al elemento')
        
        // Reproducir audio remoto
        const playRemoteAudio = () => {
          remoteAudioRef.current?.play()
            .then(() => {
              console.log('[VOICE] Audio remoto reproduciéndose correctamente')
            })
            .catch(err => {
              console.error('[VOICE] Error reproduciendo audio remoto:', err)
              // Intentar reproducir con interacción del usuario
              const playOnInteraction = () => {
                remoteAudioRef.current?.play()
                  .then(() => {
                    console.log('[VOICE] Audio remoto reproduciéndose tras interacción')
                    document.removeEventListener('click', playOnInteraction)
                    document.removeEventListener('touchstart', playOnInteraction)
                  })
                  .catch(console.error)
              }
              document.addEventListener('click', playOnInteraction, { once: true })
              document.addEventListener('touchstart', playOnInteraction, { once: true })
            })
        }
        
        // Intentar reproducir inmediatamente
        playRemoteAudio()
      }
    }

    // Manejar ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[VOICE] ICE candidate local generado', event.candidate)
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

      switch (peerConnection.connectionState) {
        case 'connected':
          console.log('[VOICE] ✅ Conexión P2P establecida exitosamente')
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
          break
        case 'closed':
          console.log('[VOICE] 🔒 Conexión P2P cerrada')
          setIsConnecting(false)
          break
      }
    }

    peerConnection.oniceconnectionstatechange = () => {
      console.log('[VOICE] Estado ICE connection:', peerConnection.iceConnectionState)

      switch (peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          console.log('[VOICE] ✅ ICE connection establecida')
          break
        case 'failed':
          console.log('[VOICE] ❌ ICE connection falló - reiniciando')
          peerConnection.restartIce()
          break
        case 'disconnected':
          console.log('[VOICE] ⚠️ ICE connection desconectada')
          break
      }
    }

    peerConnectionRef.current = peerConnection
    return peerConnection
  }, [roomId])

  // Iniciar grabación
  const startRecording = useCallback(async () => {
    if (isCleaningUpRef.current) return

    try {
      setIsConnecting(true)
      setError(null)

      // Verificar si ya estamos grabando
      if (isRecording) {
        setIsConnecting(false)
        return
      }

      // Obtener stream del micrófono
      const stream = await getLocalStream()
      console.log('[VOICE] Stream local obtenido para grabación', stream)

      // Crear o obtener peer connection
      const peerConnection = createPeerConnection()

      // Agregar stream local al peer connection
      stream.getTracks().forEach(track => {
        const sender = peerConnection.getSenders().find(s => s.track === track)
        if (!sender) {
          peerConnection.addTrack(track, stream)
          console.log('[VOICE] Track local agregado al peer connection del iniciador', track)
        }
      })

      // Solo el iniciador puede crear y enviar la oferta
      if (isInitiator && peerConnection.signalingState === 'stable') {
        console.log('[VOICE] Creando oferta como iniciador')
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        
        sendSignalingMessage({
          type: 'offer',
          offer: offer,
          roomId
        })
        
        console.log('[VOICE] Oferta creada y enviada', offer)
      }

      setIsRecording(true)
      setIsConnecting(false)

    } catch (err) {
      console.error('Error starting recording:', err)
      const errorMessage = getVoiceErrorMessage(err)
      setError(errorMessage)
      setIsConnecting(false)

      toast({
        title: "Error de audio",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }, [createPeerConnection, roomId, toast, isRecording, isInitiator, getLocalStream])

  // Detener grabación
  const stopRecording = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      localStreamRef.current = null
    }
    
    setIsRecording(false)
    setError(null)
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