"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createRoom } from "@/app/actions"
import { useToast } from "@/components/ui/use-toast"

export function RoomCreationForm() {
  const [username, setUsername] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) {
      toast({
        title: "Error",
        description: "Por favor, introduce un nombre de usuario.",
        variant: "destructive",
      })
      return
    }
    setIsLoading(true)
    // The createRoom action will redirect on success, so `result` will be undefined.
    // We only check for `result` if an error occurred before the redirect.
    const result = await createRoom(username)
    setIsLoading(false) // Set loading to false regardless, as redirect will handle success

    if (result && !result.success) {
      toast({
        title: "Error al crear sala",
        description: result.error,
        variant: "destructive",
      })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div>
        <Label htmlFor="username-create" className="sr-only">
          Tu Nombre
        </Label>
        <Input
          id="username-create"
          placeholder="Tu Nombre"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-base-style"
          disabled={isLoading}
        />
      </div>
      <Button type="submit" className="w-full btn-primary-style" disabled={isLoading}>
        {isLoading ? "Creando..." : "Crear Sala"}
      </Button>
    </form>
  )
}
