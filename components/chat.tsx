"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
import { sendMessage, setTypingIndicator } from "@/app/actions"
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

interface TypingIndicator {
  id: string
  username: string
  user_id: string
}

interface ChatProps {
  roomId: string
  currentUser: { id: string; username: string }
  initialMessages: Message[]
}

export function Chat({ roomId, currentUser, initialMessages }: ChatProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [newMessage, setNewMessage] = useState("")
  const [typingUsers, setTypingUsers] = useState<TypingIndicator[]>([])
  const [typingTimeout, setTypingTimeout] = useState<NodeJS.Timeout | null>(null)
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createBrowserClient()

  const { startRecording, stopRecording, isRecording, isConnecting, error: voiceError } = useVoice(roomId)

  useEffect(() => {
    const channel = supabase
      .channel(`room_chat:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages((prev) => [...prev, newMsg])
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "typing_indicators", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const typingData = payload.new as any
          if (typingData.user_id !== currentUser.id) {
            setTypingUsers((prev) => {
              const existing = prev.find((user) => user.user_id === typingData.user_id)
              if (!existing) {
                return [...prev, { id: typingData.id, username: typingData.username, user_id: typingData.user_id }]
              }
              return prev
            })
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "typing_indicators", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const typingData = payload.old as any
          setTypingUsers((prev) => prev.filter((user) => user.user_id !== typingData.user_id))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, supabase, currentUser.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typingUsers])

  const handleTyping = async () => {
    // Clear existing timeout
    if (typingTimeout) {
      clearTimeout(typingTimeout)
    }

    // Set typing indicator
    await setTypingIndicator(roomId, true)

    // Set new timeout to clear typing indicator
    const timeout = setTimeout(async () => {
      await setTypingIndicator(roomId, false)
    }, 2000) // Clear after 2 seconds of inactivity

    setTypingTimeout(timeout)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    // Clear typing indicator immediately when sending
    if (typingTimeout) {
      clearTimeout(typingTimeout)
      setTypingTimeout(null)
    }
    await setTypingIndicator(roomId, false)

    const result = await sendMessage(roomId, newMessage)
    if (!result.success) {
      toast({
        title: "Error al enviar mensaje",
        description: result.error,
        variant: "destructive",
      })
    } else {
      setNewMessage("")
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
    if (e.target.value.trim()) {
      handleTyping()
    } else {
      // If input is empty, clear typing indicator
      if (typingTimeout) {
        clearTimeout(typingTimeout)
        setTypingTimeout(null)
      }
      setTypingIndicator(roomId, false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
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
              )}
            >
              <CardContent className="p-0">
                <p className="font-semibold text-sm mb-1">
                  {msg.username === currentUser.username ? "Tú" : msg.username}
                </p>
                <p className="text-base">{msg.message}</p>
                <p className="text-xs opacity-75 mt-1 text-right">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Typing Indicators */}
        {typingUsers.map((user) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex justify-start"
          >
            <Card className="max-w-[70%] p-3 rounded-xl shadow-md border-none chat-bubble-receiver">
              <CardContent className="p-0">
                <p className="font-semibold text-sm mb-1">{user.username}</p>
                <div className="flex items-center space-x-1">
                  <motion.div
                    className="w-2 h-2 bg-current rounded-full"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-current rounded-full"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0.2 }}
                  />
                  <motion.div
                    className="w-2 h-2 bg-current rounded-full"
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY, delay: 0.4 }}
                  />
                  <span className="text-xs opacity-75 ml-2">escribiendo...</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-border bg-muted/20 flex flex-row items-center gap-2">
        <PushToTalkButton
          start={startRecording}
          stop={stopRecording}
          isRecording={isRecording}
          isConnecting={isConnecting}
          disabled={false}
        />
        <form onSubmit={handleSendMessage} className="flex flex-1">
          <Input
            placeholder="Escribe un mensaje..."
            value={newMessage}
            onChange={handleInputChange}
            className="flex-1 input-base-style bg-background"
          />
          <Button type="submit" className="btn-primary-style p-2 rounded-full ml-2">
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </div>
    </>
  )
}
