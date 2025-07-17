"use client" // This page needs to be a client component to use useState for the modal

import React, { useState, useEffect, useCallback } from "react" // Import React, useEffect and useCallback
import { getRoomDetails, leaveRoom } from "@/app/actions"
import { HangmanGame } from "@/components/hangman-game"
import { Chat } from "@/components/chat"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Copy, LogOut, Loader2, MessageCircle, X } from "lucide-react" // Import icons
import { ShareRoomLinkButton } from "@/components/share-room-link-button"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface RoomPageProps {
  params: Promise<{
    id: string
  }> // params is now a Promise
}

export default function RoomPage({ params }: RoomPageProps) {
  // Unwrap params using React.use()
  const { id: roomId } = React.use(params)
  const { toast } = useToast()

  const [roomDetails, setRoomDetails] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true) // New loading state
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  
  // Estados para el chat flotante en móviles
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null)

  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true) // Start loading
      const { room, currentUser: user, error } = await getRoomDetails(roomId)
      if (error) {
        setFetchError(error)
      } else {
        setRoomDetails(room)
        setCurrentUser(user)
      }
      setIsLoading(false) // End loading
    }
    fetchInitialData()
  }, [roomId])

  // Función para manejar nuevos mensajes y actualizar contador
  const handleNewMessage = useCallback((messageId: string, isOwnMessage: boolean) => {
    if (!messageId || typeof isOwnMessage !== 'boolean') return
    
    if (!isOwnMessage && !isChatOpen) {
      setUnreadMessages(prev => prev + 1)
    }
    if (isChatOpen) {
      setLastReadMessageId(messageId)
    }
  }, [isChatOpen])

  // Función para abrir/cerrar chat
  const toggleChat = () => {
    setIsChatOpen(!isChatOpen)
    if (!isChatOpen) {
      setUnreadMessages(0)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center p-4 bg-background text-foreground">
        <Card className="card-base-style p-6 sm:p-8 text-center">
          <CardTitle className="text-3xl sm:text-4xl mb-4 flex items-center justify-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin" /> Cargando Sala...
          </CardTitle>
          <CardContent className="text-base sm:text-lg">
            <p>Por favor, espera mientras preparamos la partida.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="flex h-screen items-center justify-center p-4 bg-background text-destructive">
        <Card className="card-base-style p-6 sm:p-8 text-center">
          <CardTitle className="text-3xl sm:text-4xl mb-4">Error</CardTitle>
          <CardContent className="text-base sm:text-lg">
            <p>{fetchError}</p>
            <Button onClick={() => (window.location.href = "/")} className="mt-6 btn-primary-style">
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!roomDetails || !currentUser) {
    // This case should ideally not be hit if isLoading and fetchError are handled
    return (
      <div className="flex h-screen items-center justify-center p-4 bg-background text-foreground">
        <Card className="card-base-style p-6 sm:p-8 text-center">
          <CardTitle className="text-3xl sm:text-4xl mb-4">Cargando Sala...</CardTitle>
          <CardContent className="text-base sm:text-lg">
            <p>Si la carga tarda, intenta volver al inicio.</p>
            <Button onClick={() => (window.location.href = "/")} className="mt-6 btn-primary-style">
              Volver al inicio
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isHost = roomDetails.host_user_id === currentUser.id
  const isGuest = roomDetails.guest_user_id === currentUser.id

  const handleLeaveRoom = async () => {
    const result = await leaveRoom(roomId)
    if (!result.success) {
      toast({
        title: "Error al salir de la sala",
        description: result.error,
        variant: "destructive",
      })
    }
    // Redirection is handled by the server action on success
  }

  return (
    <main className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header with all controls */}
      <div className="flex-shrink-0 mx-4 mt-4 mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-card rounded-3xl shadow-xl border border-border">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-primary">Sala</h1>
            <p className="text-sm sm:text-base text-foreground/80">
              Anfitrión: {roomDetails.host_username} {isHost && "(Tú)"}
              {roomDetails.guest_username && (
                <>
                  {" "}
                  | Invitado: {roomDetails.guest_username} {isGuest && "(Tú)"}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-center sm:justify-end items-center gap-2">
            <CopyRoomIdButton roomId={roomId} />
            <ShareRoomLinkButton roomId={roomId} />
            <div className="flex gap-2 ml-2">
              <ModeToggle />
              <Button
                onClick={() => setShowLeaveConfirm(true)}
                variant="destructive"
                size="icon"
                className="rounded-full h-10 w-10"
                aria-label={isHost ? "Cerrar Sala" : "Salir de Sala"}
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Game and Chat Area */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4 px-4 pb-4 overflow-hidden">
        {/* Game Area - Ocupa toda la pantalla en móviles */}
        <Card className="card-base-style flex-1 p-4 sm:p-6 flex flex-col items-center justify-center overflow-hidden">
          <CardContent className="flex-1 w-full flex flex-col items-center justify-center overflow-auto">
            <HangmanGame
              roomId={roomId}
              currentUser={currentUser}
              initialRoomState={roomDetails}
              initialMoves={[]} // Initial moves will be fetched by HangmanGame's useEffect
            />
          </CardContent>
        </Card>

        {/* Chat Area - Solo visible en desktop */}
        <div className="hidden lg:flex card-base-style w-full lg:w-1/3 flex-col overflow-hidden">
          <Chat 
            roomId={roomId} 
            currentUser={currentUser} 
            initialMessages={[]} 
            onNewMessage={handleNewMessage}
          />
        </div>
      </div>

      {/* Botón flotante para chat en móviles - Solo visible cuando el chat está cerrado */}
      {!isChatOpen && (
        <div className="lg:hidden fixed bottom-6 right-6 z-50">
          <Button
            onClick={toggleChat}
            className="relative bg-primary hover:bg-primary/90 text-primary-foreground rounded-full h-14 w-14 shadow-lg"
            aria-label="Abrir chat"
          >
            <MessageCircle className="h-6 w-6" />
            {unreadMessages > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center font-bold">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Chat Modal para móviles */}
      {isChatOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm">
          <div className="absolute bottom-0 left-0 right-0 h-[80vh] bg-background border-t-2 border-border rounded-t-3xl shadow-2xl">
            {/* Header del chat modal */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="text-lg font-semibold">Chat de la Sala</h3>
              <Button
                onClick={toggleChat}
                variant="ghost"
                size="icon"
                className="h-8 w-8"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Contenido del chat */}
            <div className="h-[calc(100%-4rem)] flex flex-col">
              <Chat 
                roomId={roomId} 
                currentUser={currentUser} 
                initialMessages={[]} 
                onNewMessage={handleNewMessage}
                isMobile={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Leave/Close Room Confirmation Modal */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isHost ? "¿Cerrar la sala?" : "¿Salir de la sala?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isHost
                ? "Si cierras la sala, la partida terminará para todos y el invitado será desconectado."
                : "Si sales de la sala, no podrás volver a unirte a esta partida."}
              ¿Estás seguro?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveRoom}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isHost ? "Cerrar Sala" : "Salir de Sala"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

// Client component to handle copy to clipboard
function CopyRoomIdButton({ roomId }: { roomId: string }) {
  "use client"
  const { toast } = useToast()

  const handleCopy = () => {
    navigator.clipboard.writeText(roomId)
    toast({
      title: "Copiado!",
      description: "El código de la sala ha sido copiado al portapapeles.",
    })
  }

  return (
    <Button onClick={handleCopy} className="btn-primary-style text-sm px-3 py-2 rounded-full flex items-center gap-1">
      <Copy className="h-4 w-4" />
      Copiar Código
    </Button>
  )
}