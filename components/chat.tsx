// components/chat.tsx (solo las partes modificadas)
"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send, Mic, MicOff } from "lucide-react"
import { sendMessage } from "@/app/actions"
import { createBrowserClient } from "@/lib/supabase"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import useVoice from "@/hooks/use-voice"
import { PushToTalkButton } from "./push-to-talk-button"
import { motion } from "framer-motion"

interface Message {
  id: string
  message: string
  username: string
  created_at: string
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
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()

  // Inicializar hook de voz con el userId
  const { 
    startRecording, 
    stopRecording, 
    isRecording, 
    isConnecting, 
    error: voiceError,
    isConnected
  } = useVoice(roomId, currentUser.id) // Pasamos el userId

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

  // Resto del código del chat permanece igual...
  useEffect(() => {
    const channel = supabase
      .channel(`room_chat:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newMsg = payload.new as Message
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
            
            return [...filtered, newMsg]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, supabase, currentUser.id, currentUser.username, onNewMessage])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    const tempId = `temp-${Date.now()}`
    const optimisticMsg = {
      id: tempId,
      message: newMessage,
      username: currentUser.username,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMsg])
    setNewMessage("")

    const result = await sendMessage(roomId, newMessage)
    if (!result.success) {
      toast({
        title: "Error al enviar mensaje",
        description: result.error,
        variant: "destructive",
      })
      setMessages((prev) => prev.filter((msg) => msg.id !== tempId))
    }
  }

  return (
    <>
      <div className={cn(
        "flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar",
        isMobile ? "pb-2" : ""
      )}>
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
                <p className={cn(isMobile ? "text-sm" : "text-base")}>{msg.message}</p>
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
        "p-4 border-t border-border bg-muted/20 flex flex-row items-center gap-2",
        isMobile ? "p-3" : "p-4"
      )}>
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