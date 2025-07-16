"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion" // Import framer-motion

interface VirtualKeyboardProps {
  onKeyPress: (letter: string) => void
  getStatus: (letter: string) => "default" | "correct" | "incorrect"
  disabled?: boolean
}

const keyboardLayout = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L", "Ñ"],
  ["Z", "X", "C", "V", "B", "N", "M"],
]

export function VirtualKeyboard({ onKeyPress, getStatus, disabled = false }: VirtualKeyboardProps) {
  return (
    <div className="flex flex-col items-center space-y-1 sm:space-y-2 p-2 sm:p-4 bg-muted/30 rounded-2xl sm:rounded-3xl shadow-inner border border-border">
      {keyboardLayout.map((row, rowIndex) => (
        <div key={rowIndex} className="flex space-x-0.5 sm:space-x-1">
          {row.map((letter) => {
            const status = getStatus(letter)
            return (
              <motion.div
                key={letter}
                whileTap={{ scale: 0.9 }}
                className="inline-block"
              >
                <Button
                  onClick={() => onKeyPress(letter)}
                  disabled={disabled || status !== "default"}
                  className={cn(
                    "w-8 h-8 text-sm sm:w-10 sm:h-10 sm:text-lg rounded-md sm:rounded-lg font-bold transition-colors duration-200",
                    "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                    {
                      "bg-green-500 hover:bg-green-600 text-white": status === "correct",
                      "bg-red-500 hover:bg-red-600 text-white": status === "incorrect",
                      "opacity-50 cursor-not-allowed": status !== "default" || disabled,
                    },
                  )}
                >
                  {letter}
                </Button>
              </motion.div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
