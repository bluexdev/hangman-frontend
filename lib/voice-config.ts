// lib/voice-config.ts
export const VOICE_CONFIG = {
  // URL del servidor de signaling - ajustada para tu configuración
  SIGNALING_SERVER_URL: process.env.NEXT_PUBLIC_VOICE_SERVER_URL || 'wss://server-hangman-production.up.railway.app',
  
  // Configuración WebRTC
  RTC_CONFIG: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ],
    iceCandidatePoolSize: 10
  } as RTCConfiguration,
  
  // Configuración de audio mejorada
  AUDIO_CONSTRAINTS: {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 44100,
      channelCount: 1,
      // Agregar configuraciones adicionales
      latency: 0.01, // Baja latencia
      sampleSize: 16,
      volume: 1.0
    }
  } as MediaStreamConstraints,
  
  // Timeouts ajustados
  CONNECTION_TIMEOUT: 15000, // 15 segundos
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_DELAY: 2000, // 2 segundos
  
  // Configuración adicional para desarrollo
  DEV_MODE: process.env.NODE_ENV === 'development',
  
  // Configuración de calidad de audio
  AUDIO_QUALITY: {
    bitrate: 128000, // 128 kbps
    sampleRate: 44100,
    channels: 1
  }
}

// Utilidades para manejar errores de voz
export const VoiceErrorMessages = {
  PERMISSION_DENIED: 'Permisos de micrófono denegados. Verifica la configuración del navegador.',
  DEVICE_NOT_FOUND: 'No se encontró un micrófono disponible.',
  CONNECTION_FAILED: 'Error al conectar con el servidor de voz.',
  PEER_CONNECTION_FAILED: 'Error al establecer conexión con el otro usuario.',
  SIGNALING_ERROR: 'Error en el servidor de señalización.',
  NETWORK_ERROR: 'Error de red. Verifica tu conexión a internet.',
  SERVER_UNAVAILABLE: 'Servidor de voz no disponible. Intenta más tarde.',
  UNKNOWN_ERROR: 'Error desconocido en el sistema de voz.'
}

export function getVoiceErrorMessage(error: any): string {
  if (!error) return VoiceErrorMessages.UNKNOWN_ERROR
  
  const errorMessage = error.message || error.toString()
  
  if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
    return VoiceErrorMessages.PERMISSION_DENIED
  }
  
  if (errorMessage.includes('NotFoundError') || errorMessage.includes('DevicesNotFoundError')) {
    return VoiceErrorMessages.DEVICE_NOT_FOUND
  }
  
  if (errorMessage.includes('NetworkError') || errorMessage.includes('connection')) {
    return VoiceErrorMessages.CONNECTION_FAILED
  }
  
  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('WebSocket')) {
    return VoiceErrorMessages.SERVER_UNAVAILABLE
  }
  
  if (errorMessage.includes('SignalingError')) {
    return VoiceErrorMessages.SIGNALING_ERROR
  }
  
  return VoiceErrorMessages.UNKNOWN_ERROR
}

// Verificar si el navegador soporta WebRTC
export function checkWebRTCSupport(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.navigator &&
    window.navigator.mediaDevices &&
    typeof window.navigator.mediaDevices.getUserMedia === 'function' &&
    window.RTCPeerConnection &&
    window.RTCSessionDescription &&
    window.RTCIceCandidate
  )
}

// Verificar permisos de micrófono
export async function checkMicrophonePermissions(): Promise<boolean> {
  try {
    // Verificar si estamos en el navegador
    if (typeof window === 'undefined' || !navigator.permissions) {
      return false
    }
    
    const permissions = await navigator.permissions.query({ name: 'microphone' as PermissionName })
    return permissions.state === 'granted'
  } catch (error) {
    console.warn('Could not check microphone permissions:', error)
    return false
  }
}

// Función para verificar disponibilidad de dispositivos de audio
export async function checkAudioDevices(): Promise<boolean> {
  try {
    if (!checkWebRTCSupport()) {
      return false
    }
    
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.some(device => device.kind === 'audioinput')
  } catch (error) {
    console.warn('Could not enumerate audio devices:', error)
    return false
  }
}

// Función para obtener dispositivos de audio disponibles
export async function getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(device => device.kind === 'audioinput')
  } catch (error) {
    console.warn('Could not get audio input devices:', error)
    return []
  }
}

// Función para verificar si el servidor de voz está disponible
export async function checkVoiceServerHealth(): Promise<boolean> {
  try {
    // Create an AbortController for timeout functionality
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    
    const response = await fetch(`http://localhost:3001/health`, {
      method: 'GET',
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    return response.ok
  } catch (error) {
    console.warn('Voice server health check failed:', error)
    return false
  }
}

// Función para validar configuración de WebRTC
export function validateRTCConfiguration(): boolean {
  try {
    const pc = new RTCPeerConnection(VOICE_CONFIG.RTC_CONFIG)
    pc.close()
    return true
  } catch (error) {
    console.error('Invalid RTC configuration:', error)
    return false
  }
}

// Función para optimizar configuración de audio según el navegador
export function getOptimizedAudioConstraints(): MediaStreamConstraints {
  const isChrome = /Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  
  let constraints = { ...VOICE_CONFIG.AUDIO_CONSTRAINTS }
  
  if (isChrome) {
    // Optimizaciones para Chrome
    constraints.audio = {
      ...(constraints.audio as MediaTrackConstraints),
      // Chrome-specific properties (these are legacy and may not work in modern Chrome)
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true
    }
  } else if (isFirefox) {
    // Optimizaciones para Firefox
    constraints.audio = {
      ...(constraints.audio as MediaTrackConstraints),
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true
    }
  }
  
  return constraints
}

// Logger para debugging en desarrollo
export const VoiceLogger = {
  log: (...args: any[]) => {
    if (VOICE_CONFIG.DEV_MODE) {
      console.log('[VOICE]', ...args)
    }
  },
  
  error: (...args: any[]) => {
    if (VOICE_CONFIG.DEV_MODE) {
      console.error('[VOICE ERROR]', ...args)
    }
  },
  
  warn: (...args: any[]) => {
    if (VOICE_CONFIG.DEV_MODE) {
      console.warn('[VOICE WARNING]', ...args)
    }
  }
}