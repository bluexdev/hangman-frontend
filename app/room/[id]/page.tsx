"use client" // This page needs to be a client component to use useState for the modal

import { useState } from "react"
import { getRoomDetails, leaveRoom } from "@/app/actions"
import { HangmanGame } from "@/components/hangman-game"
import { Chat } from "@/components/chat"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ModeToggle } from "@/components/mode-toggle"
import { Button } from "@/components/ui/button"
import { Copy, LogOut } from "lucide-react"
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
import { useEffect } from "react" // Import useEffect for initial data fetching

interface RoomPageProps {
  params: {
    id: string
  }
}

// This component will fetch data on the client side after initial render
// to allow for the AlertDialog state management.
// For a full server-side approach with modals, you'd typically use a separate client component for the modal trigger.
// Given the complexity of the page and the need for client-side state for the modal,
// making the whole page a client component simplifies state management for this specific request.
export default function RoomPage({ params }: RoomPageProps) {
  const { id: roomId } = params
  const { toast } = useToast()

  const [roomDetails, setRoomDetails] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  useEffect(() => {
    const fetchInitialData = async () => {
      const { room, currentUser: user, error } = await getRoomDetails(roomId)
      if (error) {
        setFetchError(error)
      } else {
        setRoomDetails(room)
        setCurrentUser(user)
      }
    }
    fetchInitialData()
  }, [roomId])

  if (fetchError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background text-destructive">
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
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background text-foreground">
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
    <main className="flex min-h-screen flex-col p-4 gap-4 bg-background">
      {/* Top-right buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
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

      {/* Main Info Bar (below top-right buttons) */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 bg-card rounded-3xl shadow-xl border border-border mt-16 sm:mt-0">
        <div className="text-center sm:text-left">
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Sala</h1> {/* Simplified title */}
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
        <div className="flex flex-wrap justify-center sm:justify-end gap-2">
          <CopyRoomIdButton roomId={roomId} />
          <ShareRoomLinkButton roomId={roomId} />
        </div>
      </div>

      {/* Main Game and Chat Area */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4">
        {/* Game Area */}
        <Card className="card-base-style flex-1 p-4 sm:p-6 flex flex-col items-center justify-center min-h-[60vh] lg:min-h-[calc(100vh-2rem-80px)]">
          <CardContent className="flex-1 w-full flex flex-col items-center justify-center">
            <HangmanGame
              roomId={roomId}
              currentUser={currentUser}
              initialRoomState={roomDetails}
              initialMoves={[]} // Initial moves will be fetched by HangmanGame's useEffect
            />
          </CardContent>
        </Card>

        {/* Chat Area */}
        <div className="card-base-style w-full lg:w-1/3 flex flex-col min-h-[40vh] lg:min-h-[calc(100vh-2rem-80px)]">
          <Chat roomId={roomId} currentUser={currentUser} initialMessages={[]} />{" "}
          {/* Initial messages will be fetched by Chat's useEffect */}
        </div>
      </div>

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
