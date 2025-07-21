// components/push-to-talk-button.tsx
"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface PushToTalkButtonProps {
  start: () => Promise<void>
  stop: () => void
  isRecording: boolean
  isConnecting: boolean
  disabled: boolean
}

export function PushToTalkButton({
  start,
  stop,
  isRecording,
  isConnecting,
  disabled
}: PushToTalkButtonProps) {
  const [isPressed, setIsPressed] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Manejar mouse/touch events
  const handleStart = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (disabled || isConnecting) return

    setIsPressed(true)
    try {
      await start()
    } catch (error) {
      console.error('Error starting recording:', error)
      setIsPressed(false)
    }
  }, [start, disabled, isConnecting])

  const handleEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isPressed) return

    setIsPressed(false)
    stop()
  }, [stop, isPressed])


  // Prevenir context menu en móviles
  useEffect(() => {
    const handleContextMenu = (e: Event) => {
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) {
        e.preventDefault()
      }
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  // Mostrar instrucciones brevemente al montar
  useEffect(() => {
    setShowInstructions(true)
    const timer = setTimeout(() => setShowInstructions(false), 3000)
    return () => clearTimeout(timer)
  }, [])

  const getButtonContent = () => {
    if (isConnecting) {
      return (
        <>
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="ml-2">Conectando...</span>
        </>
      )
    }

    if (isRecording) {
      return (
        <>
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <Mic className="h-5 w-5 text-red-500" />
          </motion.div>
          <span className="ml-2">Hablando...</span>
        </>
      )
    }

    return (
      <>
        <MicOff className="h-5 w-5" />
        <span className="ml-2">Mantén presionado</span>
      </>
    )
  }

  return (
    <div className="relative">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Button
          ref={buttonRef}
          onMouseDown={handleStart}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleStart}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
          disabled={disabled || isConnecting}
          className={cn(
            "relative transition-all duration-200 select-none",
            "px-4 py-2 rounded-full font-medium text-sm",
            "focus:outline-none focus:ring-2 focus:ring-offset-2",
            isRecording 
              ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30" 
              : "bg-primary hover:bg-primary/90 text-primary-foreground",
            isPressed && "scale-95 shadow-inner",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          style={{ touchAction: 'manipulation' }}
        >
          {getButtonContent()}
          
          {/* Indicador visual de grabación */}
          {isRecording && (
            <motion.div
              className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
          )}
        </Button>
      </motion.div>

      {/* Instrucciones flotantes */}
      {showInstructions && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute -top-12 left-1/2 transform -translate-x-1/2 
                     bg-popover text-popover-foreground text-xs px-2 py-1 
                     rounded-md shadow-lg border whitespace-nowrap z-10"
        >
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 
                         border-4 border-transparent border-t-popover" />
        </motion.div>
      )}
    </div>
  )
}