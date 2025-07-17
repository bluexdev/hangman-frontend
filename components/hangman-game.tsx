"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setWord, sendMove, resetGame, switchWordSetter } from "@/app/actions" // Import switchWordSetter
import { useToast } from "@/components/ui/use-toast"
import { createBrowserClient } from "@/lib/supabase"
import { HangmanDrawing } from "./hangman-drawing"
import { VirtualKeyboard } from "./virtual-keyboard"
import { motion } from "framer-motion"
import { RefreshCw } from "lucide-react" // Import RefreshCw icon

interface HangmanGameProps {
  roomId: string
  currentUser: { id: string; username: string }
  initialRoomState: any
  initialMoves: any[]
}

const MAX_INCORRECT_GUESSES = 6 // Head, Body, 2 Arms, 2 Legs

export function HangmanGame({ roomId, currentUser, initialRoomState, initialMoves }: HangmanGameProps) {
  const { toast } = useToast()
  const supabase = createBrowserClient()

  const [room, setRoom] = useState(initialRoomState)
  const [wordToGuess, setWordToGuess] = useState(initialRoomState.word || "")
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set())
  const [incorrectGuesses, setIncorrectGuesses] = useState(0)
  const [gameStatus, setGameStatus] = useState<"playing" | "won" | "lost" | "waiting">("waiting")
  const [hostWordInput, setHostWordInput] = useState("")

  const isHost = room.host_user_id === currentUser.id
  const isGuest = room.guest_user_id === currentUser.id
  // isMyTurn now means "it's my turn to be the guesser for this round"
  const isMyTurnToGuess = room.current_turn_user_id === currentUser.id && room.state === "playing"
  const isMyTurnToSetWord =
    room.current_turn_user_id !== currentUser.id && room.state === "waiting" && room.guest_user_id

  useEffect(() => {
    // Initialize game state from initial props (solo en el primer render)
    setRoom(initialRoomState)
    setWordToGuess(initialRoomState.word || "")
    setGameStatus(initialRoomState.state)
    const initialGuessed = new Set<string>()
    let initialIncorrect = 0
    if (initialMoves) {
      initialMoves.forEach((move) => {
        initialGuessed.add(move.letter)
        if (!move.correct) {
          initialIncorrect++
        }
      })
    }
    setGuessedLetters(initialGuessed)
    setIncorrectGuesses(initialIncorrect)

    // Supabase Realtime Subscriptions
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as any
          const oldRoom = payload.old as any

          // Check for guest joining
          if (!oldRoom.guest_user_id && updatedRoom.guest_user_id && updatedRoom.guest_user_id !== currentUser.id) {
            toast({
              title: "¡Jugador Conectado!",
              description: `${updatedRoom.guest_username} se ha unido a la sala.`,
              variant: "default",
            })
          }

          setRoom(updatedRoom)
          if (updatedRoom.word && updatedRoom.word !== wordToGuess) {
            setWordToGuess(updatedRoom.word)
            setGameStatus("playing")
            setGuessedLetters(new Set())
            setIncorrectGuesses(0)
          } else if (!updatedRoom.word && wordToGuess) {
            // Word was cleared, likely a game reset
            setWordToGuess("")
            setGameStatus("waiting")
            setGuessedLetters(new Set())
            setIncorrectGuesses(0)
            toast({
              title: "¡Nueva Ronda!",
              description: `Es el turno de ${updatedRoom.current_turn_username} para adivinar.`,
              variant: "default",
            })
          }
          setGameStatus(updatedRoom.state)

          // If room state becomes finished (e.g., host closed room), redirect
          if (updatedRoom.state === "finished") {
            toast({
              title: "Sala Cerrada",
              description: "El anfitrión ha cerrado la sala. Serás redirigido al inicio.",
              variant: "destructive",
            })
            setTimeout(() => {
              window.location.href = "/"
            }, 3000)
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "moves", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const newMove = payload.new as any
          handleNewMove(newMove.letter, newMove.correct)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, supabase, currentUser.id, toast])

  const handleNewMove = useCallback((letter: string, correct: boolean) => {
    setGuessedLetters((prev) => new Set(prev).add(letter))
    if (!correct) {
      setIncorrectGuesses((prev) => prev + 1)
    }
  }, [])

  useEffect(() => {
    if (gameStatus === "playing" && wordToGuess) {
      const uniqueLettersInWord = new Set(wordToGuess.split(""))
      const correctGuessedLetters = new Set([...guessedLetters].filter((letter) => uniqueLettersInWord.has(letter)))

      if (correctGuessedLetters.size === uniqueLettersInWord.size) {
        setGameStatus("won")
        toast({
          title: "¡Victoria!",
          description: "¡Has adivinado la palabra!",
          variant: "default",
        })
      } else if (incorrectGuesses >= MAX_INCORRECT_GUESSES) {
        setGameStatus("lost")
        toast({
          title: "¡Derrota!",
          description: `La palabra era: ${wordToGuess}`,
          variant: "destructive",
        })
      }
    }
  }, [guessedLetters, incorrectGuesses, wordToGuess, gameStatus, toast])

  const displayWord = wordToGuess.split("").map((char: string) => (guessedLetters.has(char) ? char : "_"))

  const handleSetWord = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hostWordInput.trim()) {
      toast({ title: "Error", description: "Por favor, introduce una palabra.", variant: "destructive" })
      return
    }
    const result = await setWord(roomId, hostWordInput.toUpperCase())
    if (!result.success) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Palabra establecida", description: "¡Que empiece el juego!", variant: "default" })
      setHostWordInput("") // Solo limpiar el input, NO actualizar estados locales
      // El resto del estado se actualizará por la suscripción de Supabase
    }
  }

  const handleGuess = async (letter: string) => {
    if (gameStatus !== "playing" || guessedLetters.has(letter) || !isMyTurnToGuess) {
      return
    }

    const correct = wordToGuess.includes(letter)
    const result = await sendMove(roomId, letter, correct)
    if (!result.success) {
      toast({ title: "Error", description: result.error, variant: "destructive" })
    }
  }

  const handleResetGame = async () => {
    const result = await resetGame(roomId)
    if (!result.success) {
      toast({ title: "Error al reiniciar juego", description: result.error, variant: "destructive" })
    } else {
      toast({ title: "Juego Reiniciado", description: "¡Preparando nueva ronda!", variant: "default" })
    }
  }

  const handleSwitchWordSetter = async () => {
    const result = await switchWordSetter(roomId)
    if (!result.success) {
      toast({ title: "Error al cambiar roles", description: result.error, variant: "destructive" })
    } else {
      toast({
        title: "Roles Cambiados",
        description: "¡Ahora el otro jugador establecerá la palabra!",
        variant: "default",
      })
    }
  }

  const getKeyboardStatus = (letter: string) => {
    if (guessedLetters.has(letter)) {
      return wordToGuess.includes(letter) ? "correct" : "incorrect"
    }
    return "default"
  }

  const renderGameArea = () => {
    if (room.state === "waiting") {
      if (!room.guest_user_id) {
        // Waiting for guest to join
        return (
          <div className="flex flex-col items-center justify-center h-full w-full p-4">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-primary">Esperando al invitado...</h2>
            <p className="text-base sm:text-lg text-foreground/80 text-center">
              Comparte el código de sala con tu pareja.
            </p>
          </div>
        )
      }

      if (isMyTurnToSetWord) {
        // Current user should set the word
        return (
          <div className="flex flex-col items-center justify-center h-full w-full p-4">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-primary">Tu turno de establecer la palabra</h2>
            <p className="text-base sm:text-lg text-foreground/80 mb-6 text-center">
              {room.current_turn_username} adivinará tu palabra.
            </p>
            <form onSubmit={handleSetWord} className="space-y-4 w-full max-w-sm">
              <div>
                <Label htmlFor="word-input" className="text-base sm:text-lg font-medium text-primary">
                  Introduce la palabra secreta:
                </Label>
                <Input
                  id="word-input"
                  placeholder="Ej: AMOR"
                  value={hostWordInput}
                  onChange={(e) => setHostWordInput(e.target.value.toUpperCase())}
                  className="input-base-style mt-2 text-center text-xl sm:text-2xl tracking-widest"
                  maxLength={15}
                />
              </div>
              <Button type="submit" className="w-full btn-primary-style">
                Empezar Juego
              </Button>
            </form>
            {isHost && (
              <Button
                onClick={handleSwitchWordSetter}
                variant="outline"
                className="mt-4 flex items-center gap-2 bg-transparent"
              >
                <RefreshCw className="h-4 w-4" />
                Que {room.guest_username} establezca la palabra
              </Button>
            )}
          </div>
        )
      } else {
        // Other user should set the word
        return (
          <div className="flex flex-col items-center justify-center h-full w-full p-4">
            <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-primary">
              Esperando que {room.current_turn_user_id === room.host_user_id ? room.guest_username : room.host_username}{" "}
              elija la palabra...
            </h2>
            <p className="text-base sm:text-lg text-foreground/80 text-center">¡Prepárate para adivinar!</p>
          </div>
        )
      }
    }

    // Game is playing or finished
    return (
      <div className="flex flex-col items-center justify-between h-full w-full p-4">
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="text-4xl sm:text-5xl font-bold tracking-widest text-primary mb-4">
            {displayWord.map((char: string, index: number) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="inline-block mx-0.5"
              >
                {char}
              </motion.span>
            ))}
          </h2>
          <p className="text-lg sm:text-xl text-foreground/80">
            Intentos restantes: {MAX_INCORRECT_GUESSES - incorrectGuesses}
          </p>
          {gameStatus === "playing" && (
            <p className="text-lg sm:text-xl font-semibold mt-2 text-secondary">
              {isMyTurnToGuess ? "¡Es tu turno de adivinar!" : `Turno de ${room.current_turn_username} para adivinar`}
            </p>
          )}
          {gameStatus === "won" && (
            <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400 mt-4">¡GANASTE!</p>
          )}
          {gameStatus === "lost" && (
            <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 mt-4">
              ¡PERDISTE! La palabra era: {wordToGuess}
            </p>
          )}
        </div>

        <HangmanDrawing incorrectGuesses={incorrectGuesses} />

        <div className="mt-6 sm:mt-8 w-full max-w-2xl">
          <VirtualKeyboard
            onKeyPress={handleGuess}
            getStatus={getKeyboardStatus}
            disabled={!isMyTurnToGuess || gameStatus !== "playing"}
          />
        </div>

        {(gameStatus === "won" || gameStatus === "lost") && (
          <Button onClick={handleResetGame} className="mt-6 sm:mt-8 btn-primary-style">
            Volver a Jugar
          </Button>
        )}
      </div>
    )
  }

  return <div className="w-full h-full flex flex-col items-center justify-center">{renderGameArea()}</div>
}
