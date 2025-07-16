"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { joinRoom } from "@/app/actions"
import { useToast } from "@/components/ui/use-toast"

export function RoomJoinForm() {
  const [roomId, setRoomId] = useState("")
  const [username, setUsername] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !roomId.trim()) {
      toast({
        title: "Error",
        description: "Por favor, introduce tu nombre y el código de la sala.",
        variant: "destructive",
      })
      return
    }
    setIsLoading(true)
    // The joinRoom action will redirect on success, so `result` will be undefined.
    // We only check for `result` if an error occurred before the redirect.
    const result = await joinRoom(roomId, username)
    setIsLoading(false) // Set loading to false regardless, as redirect will handle success

    if (result && !result.success) {
      toast({
        title: "Error al unirse a sala",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div>
        <Label htmlFor="username-join" className="sr-only">
          Tu Nombre
        </Label>
        <Input
          id="username-join"
          placeholder="Tu Nombre"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-base-style"
          disabled={isLoading}
        />
      </div>
      <div>
        <Label htmlFor="room-id" className="sr-only">
          Código de Sala
        </Label>
        <Input
          id="room-id"
          placeholder="Código de Sala"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          className="input-base-style"
          disabled={isLoading}
        />
      </div>
      <Button type="submit" className="w-full btn-primary-style" disabled={isLoading}>
        {isLoading ? "Uniéndose..." : "Unirse a Sala"}
      </Button>
    </form>
  )
}
