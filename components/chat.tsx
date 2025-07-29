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
}>()

export function Chat({ roomId, currentUser, initialMessages, onNewMessage, isMobile = false }: ChatProps) {
  // Inicializar estado con cache si existe
  const getCachedData = () => {
    const cached = messageCache.get(roomId)
    if (cached && Date.now() - cached.lastUpdate < 60000) { // Cache válido por 1 minuto
      return cached.messages
    }
    return initialMessages
  }

  const cachedMessages = getCachedData()
  
  const [messages, setMessages] = useState<Message[]>(() => {
    // Combinar mensajes iniciales con cache, priorizando cache si es más reciente
    const uniqueMessages = [...cachedMessages]
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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [isInitialized, setIsInitialized] = useState(cachedMessages.length > 0)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  
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
  const backgroundPollingRef = useRef<NodeJS.Timeout | null>(null)
  const isPollingRef = useRef<boolean>(false)
  const lastPollTimeRef = useRef<number>(0)
  const hasInitialLoadRef = useRef<boolean>(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastScrollTopRef = useRef<number>(0)
  const messagesLengthRef = useRef<number>(0)
  const isScrollingRef = useRef<boolean>(false)
  const connectionStableRef = useRef<boolean>(false)
  const lastConnectionChangeRef = useRef<number>(0)

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
      lastUpdate: Date.now()
    })
  }, [messages, roomId])

  // Función mejorada para scroll automático
  const scrollToBottom = useCallback((force: boolean = false) => {
    if (!messagesContainerRef.current || !messagesEndRef.current || isScrollingRef.current) return
    
    const container = messagesContainerRef.current
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight
    const scrollTop = container.scrollTop
    
    // Verificar si ya estamos en el fondo
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10
    if (isAtBottom && !force) return
    
    // Scroll suave pero efectivo
    if (force || shouldAutoScroll) {
      isScrollingRef.current = true
      
      // Usar scrollTop directo para ser más confiable
      const targetScrollTop = scrollHeight - clientHeight
      
      if (force || isMobile) {
        // Scroll inmediato en móvil o cuando es forzado
        container.scrollTop = targetScrollTop
        setTimeout(() => {
          isScrollingRef.current = false
        }, 100)
      } else {
        // Scroll suave en desktop
        container.scrollTo({
          top: targetScrollTop,
          behavior: 'smooth'
        })
        setTimeout(() => {
          isScrollingRef.current = false
        }, 500)
      }
    }
  }, [isMobile, shouldAutoScroll])

  // Manejar scroll del usuario - simplificado y mejorado
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current || isScrollingRef.current) return
    
    const container = messagesContainerRef.current
    const scrollHeight = container.scrollHeight
    const scrollTop = container.scrollTop
    const clientHeight = container.clientHeight
    
    // Detectar si está cerca del final (dentro de 100px para ser más tolerante)
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    
    // Solo actualizar si cambió el estado
    if (isNearBottom !== shouldAutoScroll) {
      setShouldAutoScroll(isNearBottom)
    }
    
    lastScrollTopRef.current = scrollTop
  }, [shouldAutoScroll])

  // Agregar listener de scroll
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    
    // Usar throttle para mejorar performance
    let scrollTimeout: NodeJS.Timeout | null = null
    const throttledHandleScroll = () => {
      if (scrollTimeout) return
      scrollTimeout = setTimeout(() => {
        handleScroll()
        scrollTimeout = null
      }, 100)
    }
    
    container.addEventListener('scroll', throttledHandleScroll, { passive: true })
    
    return () => {
      container.removeEventListener('scroll', throttledHandleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [handleScroll])

  // Scroll automático cuando cambian los mensajes - mejorado
  useEffect(() => {
    const hasNewMessages = messages.length > messagesLengthRef.current
    const isFirstLoad = messagesLengthRef.current === 0 && messages.length > 0
    messagesLengthRef.current = messages.length
    
    if (isFirstLoad) {
      // Primera carga: scroll inmediato al final
      setTimeout(() => scrollToBottom(true), 200)
    } else if (hasNewMessages && shouldAutoScroll) {
      // Nuevos mensajes y auto-scroll activado
      setTimeout(() => scrollToBottom(false), 100)
    }
  }, [messages.length, shouldAutoScroll, scrollToBottom])

  // Función optimizada para hacer polling de mensajes - MAS RAPIDO
  const pollMessages = useCallback(async (force: boolean = false) => {
    if (isUnmountedRef.current || (isPollingRef.current && !force)) return
    
    // Polling más agresivo - reducir tiempo mínimo entre polls
    const now = Date.now()
    if (!force && now - lastPollTimeRef.current < 500) return
    
    isPollingRef.current = true
    lastPollTimeRef.current = now

    try {
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
    if (backgroundPollingRef.current) {
      clearInterval(backgroundPollingRef.current)
      backgroundPollingRef.current = null
    }
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = null
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
    connectionStableRef.current = false
  }, [supabase])

  // Función mejorada para configurar el canal de Supabase - MAS AGRESIVO
  const setupChannel = useCallback(() => {
    if (isUnmountedRef.current) return

    cleanup()
    
    const now = Date.now()
    lastConnectionChangeRef.current = now
    
    setConnectionStatus('connecting')
    reconnectAttemptsRef.current += 1

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
        
        if (status === 'SUBSCRIBED') {
          setTimeout(() => {
            if (!isUnmountedRef.current && channelRef.current === channel) {
              setConnectionStatus('connected')
              setIsInitialized(true)
              reconnectAttemptsRef.current = 0
              connectionStableRef.current = true
              
              // Parar polling cuando está conectado y estable
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current)
                pollingIntervalRef.current = null
              }
              if (backgroundPollingRef.current) {
                clearInterval(backgroundPollingRef.current)
                backgroundPollingRef.current = null
              }
            }
          }, 300)
          
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          connectionStableRef.current = false
          setConnectionStatus('disconnected')
          
          // Iniciar polling INMEDIATO como fallback
          if (!pollingIntervalRef.current) {
            pollingIntervalRef.current = setInterval(() => {
              if (!isUnmountedRef.current && !connectionStableRef.current) {
                pollMessages(true)
              }
            }, 1000) // Polling cada 1 segundo cuando no hay conexión
          }
          
          // Intentar reconectar más rápido
          if (reconnectAttemptsRef.current < 10) {
            const delay = Math.min(500 * Math.pow(1.2, reconnectAttemptsRef.current - 1), 3000)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (!isUnmountedRef.current && !connectionStableRef.current) {
                setupChannel()
              }
            }, delay)
          }
        }
      })

    channelRef.current = channel
  }, [roomId, supabase, currentUser.username, onNewMessage, cleanup, pollMessages])

  // Setup inicial con polling continuo en background
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
    
    // Polling inmediato si no hay mensajes
    if (messages.length === 0) {
      pollMessages(true)
    } else {
      setIsInitialized(true)
      setTimeout(() => scrollToBottom(true), 300)
    }
    
    // Configurar canal
    setupChannel()
    
    // POLLING CONTINUO EN BACKGROUND - Esto asegura que siempre recibas mensajes
    backgroundPollingRef.current = setInterval(() => {
      if (!isUnmountedRef.current) {
        pollMessages(true)
      }
    }, 2000) // Polling cada 2 segundos SIEMPRE
    
    // Listeners para eventos de ventana
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Polling inmediato cuando vuelve a ser visible
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            pollMessages(true)
          }
        }, 100)
      }
    }

    const handleFocus = () => {
      setTimeout(() => {
        if (!isUnmountedRef.current) {
          pollMessages(true)
        }
      }, 100)
    }

    const handleOnline = () => {
      if (!isUnmountedRef.current) {
        reconnectAttemptsRef.current = 0
        pollMessages(true)
        setTimeout(setupChannel, 200)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    
    return () => {
      isUnmountedRef.current = true
      cleanup()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    // Activar auto-scroll cuando el usuario envía un mensaje
    setShouldAutoScroll(true)
    
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
        // Polling inmediato para obtener el mensaje real
        setTimeout(() => {
          if (!isUnmountedRef.current) {
            pollMessages(true)
          }
        }, 200) // Muy rápido
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
    // Activar auto-scroll cuando se selecciona un GIF
    setShouldAutoScroll(true)
    
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
    if (!isInitialized) {
      return 'Cargando...'
    }
    
    switch (connectionStatus) {
      case 'connected': return 'En línea'
      case 'connecting': return 'Conectando...'
      case 'disconnected': return 'Reconectando...'
      default: return ''
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Indicador de estado FIJO en la parte superior - DISEÑO ORIGINAL */}
      <div className="flex-shrink-0 px-4 py-2 bg-background/80 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={cn(
              "w-2 h-2 rounded-full", 
              getConnectionStatusColor(),
              connectionStatus === 'connecting' ? "animate-pulse" : ""
            )} />
            <span>{getConnectionStatusText()}</span>
            {isInitialized && messages.length > 0 && (
              <span className="text-xs opacity-60">
                ({messages.filter(m => !m.id.startsWith("temp-")).length})
              </span>
            )}
          </div>
          
          {/* Botón para ir al final solo si no está en auto-scroll - DISEÑO ORIGINAL */}
          {!shouldAutoScroll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShouldAutoScroll(true)
                setTimeout(() => scrollToBottom(true), 50)
              }}
              className="text-xs px-2 py-1 h-6"
            >
              ↓
            </Button>
          )}
        </div>
      </div>

      {/* Área de mensajes - DISEÑO ORIGINAL */}
      <div 
        ref={messagesContainerRef}
        className={cn(
          "flex-1 overflow-y-auto p-4 custom-scrollbar",
          isMobile ? "pb-2" : ""
        )}
        style={{
          minHeight: isMobile ? '200px' : '300px',
          height: '100%'
        }}
      >
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
          <div className="space-y-4">
            {messages.map((msg) => (
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
            ))}
            
            {/* Espacio adicional después del último mensaje */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Área de entrada de mensajes - DISEÑO ORIGINAL */}
      <div className={cn(
        "relative p-4 border-t border-border bg-muted/20 flex flex-row items-center gap-2 flex-shrink-0",
        isMobile ? "p-3" : "p-4"
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
    </div>
  )
}