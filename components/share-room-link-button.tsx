"use client"

import { Button } from "@/components/ui/button"
import { Share2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useEffect, useState } from "react"

interface ShareRoomLinkButtonProps {
  roomId: string
}

export function ShareRoomLinkButton({ roomId }: ShareRoomLinkButtonProps) {
  const { toast } = useToast()
  const [roomLink, setRoomLink] = useState("")

  useEffect(() => {
    // Ensure window is defined (client-side)
    if (typeof window !== "undefined") {
      setRoomLink(`${window.location.origin}/room/${roomId}`)
    }
  }, [roomId])

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Únete a mi partida de Ahorcado Duo!",
          url: roomLink,
        })
        toast({
          title: "Compartido!",
          description: "El link de la sala ha sido compartido.",
        })
      } catch (error) {
        console.error("Error sharing:", error)
        toast({
          title: "Error al compartir",
          description: "No se pudo compartir el link. Intenta copiarlo.",
          variant: "destructive",
        })
      }
    } else {
      // Fallback for browsers that don't support navigator.share
      navigator.clipboard.writeText(roomLink)
      toast({
        title: "Copiado!",
        description: "El link de la sala ha sido copiado al portapapeles.",
      })
    }
  }

  return (
    <Button onClick={handleShare} className="btn-primary-style text-sm px-4 py-2 rounded-full flex items-center gap-2">
      <Share2 className="h-4 w-4" />
      Compartir Link
    </Button>
  )
}
