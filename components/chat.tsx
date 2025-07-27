// components/chat.tsx
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send, Mic, MicOff, Image as ImageIcon } from "lucide-react"
import { sendMessage } from "@/app/actions"
import { createBrowserClient } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import useVoice from "@/hooks/use-voice"
import { PushToTalkButton } from "./push-to-talk-button"
import { GiphySelector } from "./giphy-selector"
import { motion, AnimatePresence } from "framer-motion"

interface Message {
  id: string
  message: string
  username: string
  created_at: string
  message_type?: 'text' | 'gif'
}

interface ChatProps {
  roomId: string
  currentUser: { id: string; username: string }
  initialMessages: Message[]
  onNewMessage?: (messageId: string, isOwnMessage: boolean) => void
  isMobile?: boolean
}

// Cache global para mantener mensajes entre montajes/desmontajes
const messageCache = new Map<string, {
  messages: Message[]
  lastUpdate: number
  connectionStatus: 'connecting' | 'connected' | 'disconnected'
}>()

// Cache de conexiones de Supabase para reutilizar
const connectionCache = new Map<string, any>()

export function Chat({ roomId, currentUser, initialMessages, onNewMessage, isMobile = false }: ChatProps) {
  // Inicializar estado con cache si existe
  const getCachedData = () => {
    const cached = messageCache.get(roomId)
    if (cached && Date.now() - cached.lastUpdate < 30000) { // Cache válido por 30 segundos
      return {
        messages: cached.messages,
        connectionStatus: cached.connectionStatus as 'connecting' | 'connected' | 'disconnected'
      }
    }
    return {
      messages: initialMessages,
      connectionStatus: 'connecting' as const
    }
  }

  const cachedData = getCachedData()
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Combinar mensajes iniciales con cache, priorizando cache si es más reciente
    const uniqueMessages = [...cachedData.messages]
      .reduce((acc, msg) => {
        if (!acc.find(m => m.id === msg.id)) {
          acc.push(msg)
        }
        return acc
      }, [] as Message[])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    
    return uniqueMessages
  })
  
  const [newMessage, setNewMessage] = useState("")
  const [showGiphySelector, setShowGiphySelector] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>(cachedData.connectionStatus)
  const [isInitialized, setIsInitialized] = useState(cachedData.messages.length > 0)
  
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()
  const channelRef = useRef<any>(null)
  const lastMessageIdRef = useRef<string>("")
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef<number>(0)
  const isUnmountedRef = useRef<boolean>(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef<boolean>(false)
  const lastPollTimeRef = useRef<number>(0)
  const hasInitialLoadRef = useRef<boolean>(false)

  // Inicializar hook de voz con el userId
  const { 
    startRecording, 
    stopRecording, 
    isRecording, 
    isConnecting, 
    error: voiceError,
    isConnected
  } = useVoice(roomId, currentUser.id)

  // Actualizar cache cuando cambian los mensajes
  useEffect(() => {
    messageCache.set(roomId, {
      messages: messages,
      lastUpdate: Date.now(),
      connectionStatus: connectionStatus
    })
  }, [messages, connectionStatus, roomId])

  // Función optimizada para hacer polling de mensajes
  const pollMessages = useCallback(async (force: boolean = false) => {
    if (isUnmountedRef.current || (isPollingRef.current && !force)) return
    
    // Evitar polling demasiado frecuente a menos que sea forzado
    const now = Date.now()
    if (!force && now - lastPollTimeRef.current < 1000) return
    
    isPollingRef.current = true
    lastPollTimeRef.current = now

    try {
      console.log('Polling messages for room:', roomId)
      
      const { data, error } = await supabase
        .from("messages")
        .select(`id, message, username, created_at, message_type`)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error polling messages:", error)
        return
      }

      if (data && Array.isArray(data)) {
        const typedMessages: Message[] = data.map(item => ({
          id: item.id as string,
          message: item.message as string,
          username: item.username as string,
          created_at: item.created_at as string,
          message_type: (item.message_type as 'text' | 'gif') || 'text'
        }))

        console.log('Polled messages:', typedMessages.length)

        setMessages(prevMessages => {
          // Si es la primera carga y no tenemos mensajes, usar los obtenidos
          if (!hasInitialLoadRef.current && prevMessages.length === 0) {
            hasInitialLoadRef.current = true
            setIsInitialized(true)
            
            if (typedMessages.length > 0) {
              lastMessageIdRef.current = typedMessages[typedMessages.length - 1].id
            }
            
            return typedMessages
          }

          // Crear mapa de mensajes existentes para comparación eficiente
          const existingIds = new Set(prevMessages.map(m => m.id))
          const newIds = new Set(typedMessages.map(m => m.id))
          
          // Solo actualizar si hay diferencias reales
          const hasNewMessages = typedMessages.some(msg => !existingIds.has(msg.id))
          const hasMissingMessages = prevMessages.some(msg => !newIds.has(msg.id) && !msg.id.startsWith("temp-"))
          
          if (hasNewMessages || hasMissingMessages || prevMessages.length !== typedMessages.length) {
            // Mantener mensajes temporales que no han sido reemplazados
            const tempMessages = prevMessages.filter(msg => 
              msg.id.startsWith("temp-") && 
              !typedMessages.some(newMsg => 
                newMsg.message === msg.message && 
                newMsg.username === msg.username &&
                Math.abs(new Date(newMsg.created_at).getTime() - new Date(msg.created_at).getTime()) < 30000
              )
            )
            
            // Combinar mensajes reales con temporales
            const combinedMessages = [...typedMessages, ...tempMessages]
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            
            // Actualizar último ID si hay mensajes reales
            if (typedMessages.length > 0) {
              lastMessageIdRef.current = typedMessages[typedMessages.length - 1].id
            }
            
            if (!isInitialized) {
              setIsInitialized(true)
            }
            
            return combinedMessages
          }
          
          return prevMessages
        })
      }
    } catch (error) {
      console.error("Error in pollMessages:", error)
    } finally {
      isPollingRef.current = false
    }
  }, [roomId, supabase, isInitialized])

  // Función para inicializar polling con mejor control
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    
    // Polling más agresivo si no está inicializado o desconectado
    const pollInterval = (!isInitialized || connectionStatus === 'disconnected') ? 1500 : 5000
    
    pollingIntervalRef.current = setInterval(() => {
      if (!isUnmountedRef.current) {
        if (!isInitialized || connectionStatus === 'disconnected') {
          pollMessages()
        }
      }
    }, pollInterval)
  }, [connectionStatus, pollMessages, isInitialized])

  // Función para limpiar recursos
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current)
      } catch (error) {
        console.error("Error removing channel:", error)
      }
      channelRef.current = null
    }
    isPollingRef.current = false
  }, [supabase])

  // Función mejorada para configurar el canal de Supabase
  const setupChannel = useCallback(() => {
    if (isUnmountedRef.current) return

    cleanup()
    
    // Si hay conexión cacheada y aún es válida, reutilizarla
    const cachedConnection = connectionCache.get(roomId)
    if (cachedConnection && cachedConnection.state === 'joined') {
      channelRef.current = cachedConnection
      setConnectionStatus('connected')
      setIsInitialized(true)
      return
    }
    
    setConnectionStatus('connecting')
    reconnectAttemptsRef.current += 1

    console.log('Setting up channel for room:', roomId)

    const channel = supabase
      .channel(`room_chat:${roomId}`)
      .on(
        "postgres_changes",
        { 
          event: "INSERT", 
          schema: "public", 
          table: "messages", 
          filter: `room_id=eq.${roomId}` 
        },
        (payload) => {
          if (isUnmountedRef.current) return

          const newMsg = payload.new as Message
          console.log('New message received:', newMsg.id)
          
          // Evitar duplicados más estricto
          if (newMsg.id === lastMessageIdRef.current) {
            return
          }
          
          setMessages((prev) => {
            // Verificar si el mensaje ya existe
            if (prev.some((msg) => msg.id === newMsg.id)) return prev
            
            // Remover mensajes temporales que coincidan exactamente
            const filtered = prev.filter((msg) => {
              if (!msg.id.startsWith("temp-")) return true
              
              const isSameMessage = msg.message === newMsg.message && 
                                  msg.username === newMsg.username &&
                                  Math.abs(new Date(msg.created_at).getTime() - new Date(newMsg.created_at).getTime()) < 30000
              
              return !isSameMessage
            })
            
            // Callback para nuevo mensaje
            if (onNewMessage && newMsg.id && newMsg.username) {
              const isOwnMessage = newMsg.username === currentUser.username
              setTimeout(() => {
                if (!isUnmountedRef.current) {
                  onNewMessage(newMsg.id, isOwnMessage)
                }
              }, 0)
            }
            
            lastMessageIdRef.current = newMsg.id
            const newMessages = [...filtered, newMsg].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
            
            return newMessages
          })
        }
      )
      .subscribe((status) => {
        if (isUnmountedRef.current) return

        console.log('Channel status for room', roomId, ':', status)
        
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected')
          setIsInitialized(true)
          reconnectAttemptsRef.current = 0
          
          // Guardar conexión en cache
          connectionCache.set(roomId, channel)
          
          // Parar polling cuando está conectado
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          
          // Hacer un refresh de mensajes al conectar solo si no tenemos mensajes
          if (messages.length === 0) {
            setTimeout(() => {
              if (!isUnmountedRef.current) {
                pollMessages(true) // Forzar polling
              }
            }, 500)
          }
          
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          setConnectionStatus('disconnected')
          
          // Remover de cache si falla
          connectionCache.delete(roomId)
          
          // Iniciar polling como fallback inmediatamente
          startPolling()
          
          // Intentar reconectar con backoff exponencial solo si no hemos alcanzado el límite
          if (reconnectAttemptsRef.current < 3) { // Reducir intentos para ser menos agresivo
            const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 5000)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isUnmountedRef.current) {
                console.log(`Attempting to reconnect (attempt ${reconnectAttemptsRef.current})...`)
                setupChannel()
              }
            }, delay)
          } else {
            console.log('Max reconnection attempts reached, using polling mode')
            if (!isInitialized) {
              // Solo mostrar toast si realmente no tenemos mensajes
              toast({
                title: "Modo offline",
                description: "Cargando mensajes...",
                variant: "default",
              })
            }
          }
        }
      })

    channelRef.current = channel
  }, [roomId, supabase, currentUser.username, onNewMessage, cleanup, startPolling, pollMessages, toast, isInitialized, messages.length])

  // Función para recargar mensajes manualmente
  const reloadMessages = useCallback(async () => {
    if (isUnmountedRef.current) return
    
    setIsReconnecting(true)
    try {
      await pollMessages(true) // Forzar polling
      
      // Si aún no está conectado, intentar reconectar
      if (connectionStatus !== 'connected') {
        reconnectAttemptsRef.current = 0
        setupChannel()
      }
    } finally {
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          setIsReconnecting(false)
        }
      }, 1000)
    }
  }, [pollMessages, connectionStatus, setupChannel])

  // Función para manejar visibilidad de la página
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible' && !isUnmountedRef.current) {
      console.log('Page became visible, refreshing chat')
      
      // Recargar mensajes cuando la página vuelve a estar visible
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          reloadMessages()
        }
      }, 100)
    }
  }, [reloadMessages])

  // Configurar canal inicial y listeners
  useEffect(() => {
    isUnmountedRef.current = false
    
    // Inicializar lastMessageIdRef
    if (messages.length > 0) {
      const sortedMessages = [...messages].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      lastMessageIdRef.current = sortedMessages[sortedMessages.length - 1]?.id || ""
      hasInitialLoadRef.current = true
    }
    
    console.log('Initializing chat for room:', roomId, 'with', messages.length, 'cached messages')
    
    // Si no tenemos mensajes en cache, hacer polling inmediato
    if (messages.length === 0) {
      console.log('No cached messages, starting immediate poll')
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          pollMessages(true)
        }
      }, 100)
    } else {
      setIsInitialized(true)
    }
    
    // Configurar canal
    setupChannel()
    
    // Listeners para eventos de ventana
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    const handleFocus = () => {
      if (!isUnmountedRef.current) {
        console.log('Window focused, refreshing messages')
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            reloadMessages()
          }
        }, 100)
      }
    }

    const handleOnline = () => {
      if (!isUnmountedRef.current && connectionStatus === 'disconnected') {
        console.log('Connection restored, reconnecting')
        reconnectAttemptsRef.current = 0
        setTimeout(setupChannel, 100)
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    
    // Inicializar polling de respaldo
    startPolling()
    
    return () => {
      console.log('Cleaning up chat for room:', roomId)
      isUnmountedRef.current = true
      cleanup()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, []) // Solo ejecutar una vez al montar

  // Mostrar errores de voz
  useEffect(() => {
    if (voiceError) {
      toast({
        title: "Error de voz",
        description: voiceError,
        variant: "destructive",
      })
    }
  }, [voiceError, toast])

  // Scroll automático al final con mejor control
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesEndRef.current && messagesContainerRef.current) {
        const container = messagesContainerRef.current
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100
        
        // Solo hacer scroll automático si estamos cerca del final o es el primer mensaje
        if (isNearBottom || messages.length <= 3) {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
          })
        }
      }
    }
    
    // Delay para permitir que el DOM se actualice correctamente
    setTimeout(scrollToBottom, 50)
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    await sendTextMessage(newMessage, 'text')
  }

  const sendTextMessage = async (message: string, type: 'text' | 'gif' = 'text') => {
    if (!message.trim()) return
    
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const optimisticMsg: Message = {
      id: tempId,
      message: message.trim(),
      username: currentUser.username,
      created_at: new Date().toISOString(),
      message_type: type,
    }
    
    // Agregar mensaje optimista
    setMessages((prev) => {
      // Evitar duplicados de mensajes temporales
      if (prev.some(msg => msg.id === tempId)) return prev
      
      const newMessages = [...prev, optimisticMsg].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      return newMessages
    })
    
    setNewMessage("")

    try {
      const result = await sendMessage(roomId, message.trim(), type)
      if (!result.success) {
        toast({
          title: "Error al enviar mensaje",
          description: result.error,
          variant: "destructive",
        })
        // Remover mensaje temporal en caso de error
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId))
      } else {
        // Hacer polling después de un delay para obtener el mensaje real
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            pollMessages(true)
          }
        }, 1000)
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error al enviar mensaje",
        description: "No se pudo enviar el mensaje. Intenta nuevamente.",
        variant: "destructive",
      })
      // Remover mensaje temporal en caso de error
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId))
    }
  }

  const handleGifSelect = (gifUrl: string) => {
    sendTextMessage(gifUrl, 'gif')
    setShowGiphySelector(false)
  }

  const renderMessage = (msg: Message) => {
    if (msg.message_type === 'gif') {
      return (
        <div className="space-y-2">
          <img
            src={msg.message}
            alt="GIF"
            className={cn(
              "rounded-lg max-w-full h-auto",
              isMobile ? "max-h-48" : "max-h-64"
            )}
            loading="lazy"
            onError={(e) => {
              console.error("Error loading GIF:", msg.message)
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              const fallback = document.createElement('p')
              fallback.textContent = `GIF: ${msg.message}`
              fallback.className = 'text-sm text-muted-foreground'
              target.parentNode?.appendChild(fallback)
            }}
          />
        </div>
      )
    }

    return (
      <p className={cn(isMobile ? "text-sm" : "text-base")}>
        {msg.message}
      </p>
    )
  }

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500'
      case 'connecting': return 'bg-yellow-500'
      case 'disconnected': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getConnectionStatusText = () => {
    if (isReconnecting) return 'Sincronizando...'
    
    if (!isInitialized) {
      return 'Cargando mensajes...'
    }
    
    switch (connectionStatus) {
      case 'connected': return 'Conectado'
      case 'connecting': return 'Conectando...'
      case 'disconnected': return 'Modo offline'
      default: return 'Estado desconocido'
    }
  }

  return (
    <>
      <div 
        ref={messagesContainerRef}
        className={cn(
          "flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar",
          isMobile ? "pb-2" : ""
        )}
        style={{
          minHeight: isMobile ? '200px' : '300px',
          height: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Indicador de estado de conexión */}
        <div className="flex items-center justify-between py-2 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={cn(
              "w-2 h-2 rounded-full", 
              getConnectionStatusColor(),
              (connectionStatus === 'connecting' || isReconnecting) ? "animate-pulse" : ""
            )} />
            <span>{getConnectionStatusText()}</span>
            {isInitialized && messages.length > 0 && (
              <span className="text-xs opacity-60">
                ({messages.filter(m => !m.id.startsWith("temp-")).length})
              </span>
            )}
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={reloadMessages}
            className="text-xs px-2 py-1"
            disabled={isReconnecting}
          >
            {isReconnecting ? "..." : "↻"}
          </Button>
        </div>

        <div className="flex-1 space-y-4 min-h-0">
          {!isInitialized || (messages.length === 0 && connectionStatus === 'connecting') ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-2">
                <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p>Cargando mensajes...</p>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-center">No hay mensajes aún</p>
            </div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn("flex", msg.username === currentUser.username ? "justify-end" : "justify-start")}
              >
                <Card
                  className={cn(
                    "max-w-[70%] p-3 rounded-xl shadow-md border-none",
                    msg.username === currentUser.username ? "chat-bubble-sender" : "chat-bubble-receiver",
                    isMobile ? "text-sm" : "text-base",
                    // Indicar mensajes temporales
                    msg.id.startsWith("temp-") ? "opacity-70 border border-dashed border-muted" : ""
                  )}
                >
                  <CardContent className="p-0">
                    <p className={cn("font-semibold mb-1", isMobile ? "text-xs" : "text-sm")}>
                      {msg.username === currentUser.username ? "Tú" : msg.username}
                    </p>
                    {renderMessage(msg)}
                    <p className={cn("opacity-75 mt-1 text-right", isMobile ? "text-xs" : "text-xs")}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {msg.id.startsWith("temp-") && " ⏳"}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>
      
      <div className={cn(
        "relative p-4 border-t border-border bg-muted/20 flex flex-row items-center gap-2",
        isMobile ? "p-3" : "p-4",
        "flex-shrink-0"
      )}>
        {/* Selector de GIFs */}
        <AnimatePresence>
          {showGiphySelector && (
            <GiphySelector
              onSelectGifAction={handleGifSelect}
              onCloseAction={() => setShowGiphySelector(false)}
              isMobile={isMobile}
            />
          )}
        </AnimatePresence>

        {/* Indicador de estado de voz */}
        {!isConnected && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            <span>Conectando voz...</span>
          </div>
        )}
        
        <PushToTalkButton
          start={startRecording}
          stop={stopRecording}
          isRecording={isRecording}
          isConnecting={isConnecting}
          disabled={!isConnected}
        />

        {/* Botón de GIFs */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowGiphySelector(!showGiphySelector)}
          className={cn(
            "hover:bg-muted transition-colors",
            showGiphySelector ? "bg-muted text-primary" : "text-muted-foreground",
            isMobile ? "p-2" : "p-2"
          )}
        >
          <ImageIcon className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
        </Button>
        
        <form onSubmit={handleSendMessage} className="flex flex-1">
          <Input
            placeholder="Escribe un mensaje..."
            value={newMessage}
            onChange={handleInputChange}
            className={cn(
              "flex-1 input-base-style bg-background",
              isMobile ? "text-base" : ""
            )}
            style={isMobile ? { fontSize: '16px' } : {}}
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim()}
            className={cn(
              "btn-primary-style rounded-full ml-2",
              isMobile ? "p-2" : "p-2"
            )}
          >
            <Send className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
          </Button>
        </form>
      </div>
    </>
  )
}