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

export function Chat({ roomId, currentUser, initialMessages, onNewMessage, isMobile = false }: ChatProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [newMessage, setNewMessage] = useState("")
  const [showGiphySelector, setShowGiphySelector] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()
  const channelRef = useRef<any>(null)
  const lastMessageIdRef = useRef<string>("")

  // Inicializar hook de voz con el userId
  const { 
    startRecording, 
    stopRecording, 
    isRecording, 
    isConnecting, 
    error: voiceError,
    isConnected
  } = useVoice(roomId, currentUser.id)

  // Función para recargar mensajes desde la base de datos
  const reloadMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select(`id, message, username, created_at, message_type`)
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error reloading messages:", error)
        return
      }

      if (data) {
        // Type assertion to ensure proper typing
        const typedMessages: Message[] = data.map(item => ({
          id: item.id as string,
          message: item.message as string,
          username: item.username as string,
          created_at: item.created_at as string,
          message_type: (item.message_type as 'text' | 'gif') || 'text'
        }))
        
        setMessages(typedMessages)
        // Actualizar el último mensaje ID
        if (typedMessages.length > 0) {
          lastMessageIdRef.current = typedMessages[typedMessages.length - 1].id
        }
      }
    } catch (error) {
      console.error("Error in reloadMessages:", error)
    }
  }, [roomId, supabase])

  // Función para manejar visibilidad de la página
  const handleVisibilityChange = useCallback(() => {
    if (document.visibilityState === 'visible') {
      // Cuando la página vuelve a ser visible, recargar mensajes
      setIsReconnecting(true)
      reloadMessages().finally(() => {
        setIsReconnecting(false)
      })
    }
  }, [reloadMessages])

  // Efecto para manejar la visibilidad de la página
  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // También escuchar eventos de focus/blur en la ventana
    const handleFocus = () => {
      setIsReconnecting(true)
      reloadMessages().finally(() => {
        setIsReconnecting(false)
      })
    }

    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [handleVisibilityChange, reloadMessages])

  // Función para configurar el canal de Supabase
  const setupChannel = useCallback(() => {
    // Limpiar canal anterior si existe
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

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
          const newMsg = payload.new as Message
          
          // Evitar duplicados
          if (newMsg.id === lastMessageIdRef.current) {
            return
          }
          
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMsg.id)) return prev
            
            const filtered = prev.filter(
              (msg) => !(msg.id.startsWith("temp-") && msg.message === newMsg.message && msg.username === newMsg.username)
            )
            
            if (onNewMessage && newMsg.id && newMsg.username) {
              const isOwnMessage = newMsg.username === currentUser.username
              setTimeout(() => {
                onNewMessage(newMsg.id, isOwnMessage)
              }, 0)
            }
            
            lastMessageIdRef.current = newMsg.id
            return [...filtered, newMsg]
          })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Chat channel connected')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Chat channel error, attempting to reconnect...')
          // Intentar reconectar después de un breve delay
          setTimeout(() => {
            setupChannel()
          }, 2000)
        }
      })

    channelRef.current = channel
  }, [roomId, supabase, currentUser.username, onNewMessage])

  // Configurar canal inicial
  useEffect(() => {
    setupChannel()
    
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [setupChannel])

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

  // Scroll automático al final
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Inicializar lastMessageIdRef con el último mensaje
  useEffect(() => {
    if (initialMessages.length > 0) {
      lastMessageIdRef.current = initialMessages[initialMessages.length - 1].id
    }
  }, [initialMessages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    await sendTextMessage(newMessage, 'text')
  }

  const sendTextMessage = async (message: string, type: 'text' | 'gif' = 'text') => {
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const optimisticMsg: Message = {
      id: tempId,
      message: message,
      username: currentUser.username,
      created_at: new Date().toISOString(),
      message_type: type,
    }
    
    setMessages((prev) => [...prev, optimisticMsg])
    setNewMessage("")

    try {
      const result = await sendMessage(roomId, message, type)
      if (!result.success) {
        toast({
          title: "Error al enviar mensaje",
          description: result.error,
          variant: "destructive",
        })
        setMessages((prev) => prev.filter((msg) => msg.id !== tempId))
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Error al enviar mensaje",
        description: "No se pudo enviar el mensaje. Intenta nuevamente.",
        variant: "destructive",
      })
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
              // Mostrar el URL como fallback
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

  return (
    <>
      <div className={cn(
        "flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar",
        isMobile ? "pb-2" : ""
      )}>
        {/* Indicador de reconexión */}
        {isReconnecting && (
          <div className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span>Sincronizando mensajes...</span>
            </div>
          </div>
        )}

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
                isMobile ? "text-sm" : "text-base"
              )}
            >
              <CardContent className="p-0">
                <p className={cn("font-semibold mb-1", isMobile ? "text-xs" : "text-sm")}>
                  {msg.username === currentUser.username ? "Tú" : msg.username}
                </p>
                {renderMessage(msg)}
                <p className={cn("opacity-75 mt-1 text-right", isMobile ? "text-xs" : "text-xs")}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        <div ref={messagesEndRef} />
      </div>
      
      <div className={cn(
        "relative p-4 border-t border-border bg-muted/20 flex flex-row items-center gap-2",
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
          <Button type="submit" className={cn(
            "btn-primary-style rounded-full ml-2",
            isMobile ? "p-2" : "p-2"
          )}>
            <Send className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
          </Button>
        </form>
      </div>
    </>
  )
}