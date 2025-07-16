"use client"

import { Button } from "@/components/ui/button"
import { Mic, MicOff, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface PushToTalkButtonProps {
  start: () => void
  stop: () => void
  isRecording: boolean
  isConnecting: boolean
  disabled?: boolean
}

export function PushToTalkButton({ start, stop, isRecording, isConnecting, disabled = false }: PushToTalkButtonProps) {
  const handleMouseDown = () => {
    if (!disabled && !isRecording && !isConnecting) {
      start()
    }
  }

  const handleMouseUp = () => {
    if (isRecording) {
      stop()
    }
  }

  return (
    <Button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleMouseDown} // For mobile touch devices
      onTouchEnd={handleMouseUp} // For mobile touch devices
      className={cn("btn-primary-style", {
        "bg-red-500 hover:bg-red-600 text-white": isRecording,
        "bg-gray-400 cursor-not-allowed": disabled || isConnecting,
      })}
      size="icon"
      disabled={disabled || isConnecting}
      aria-label={isRecording ? "Grabando voz" : "Presiona para hablar"}
    >
      {isConnecting ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : isRecording ? (
        <Mic className="h-5 w-5" />
      ) : (
        <MicOff className="h-5 w-5" />
      )}
    </Button>
  )
}
