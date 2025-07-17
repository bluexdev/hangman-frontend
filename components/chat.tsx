"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"
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
}

export function Chat({ roomId, currentUser, initialMessages }: ChatProps) {
  const [messages, setMessages] = useState(initialMessages)
  const [newMessage, setNewMessage] = useState("")
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
          setMessages((prev) => {
            if (prev.some((msg) => msg.id === newMsg.id)) return prev
            const filtered = prev.filter(
              (msg) => !(msg.id.startsWith("temp-") && msg.message === newMsg.message && msg.username === newMsg.username)
            )
            return [...filtered, newMsg]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, supabase, currentUser.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value)
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    // Optimistic UI
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