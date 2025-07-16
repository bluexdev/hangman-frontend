interface HangmanDrawingProps {
  incorrectGuesses: number
}

export function HangmanDrawing({ incorrectGuesses }: HangmanDrawingProps) {
  const parts = [
    // Head
    <circle key="head" cx="100" cy="50" r="20" stroke="currentColor" strokeWidth="4" fill="none" />,
    // Body
    <line key="body" x1="100" y1="70" x2="100" y2="120" stroke="currentColor" strokeWidth="4" />,
    // Left Arm
    <line key="left-arm" x1="100" y1="80" x2="70" y2="110" stroke="currentColor" strokeWidth="4" />,
    // Right Arm
    <line key="right-arm" x1="100" y1="80" x2="130" y2="110" stroke="currentColor" strokeWidth="4" />,
    // Left Leg
    <line key="left-leg" x1="100" y1="120" x2="70" y2="160" stroke="currentColor" strokeWidth="4" />,
    // Right Leg
    <line key="right-leg" x1="100" y1="120" x2="130" y2="160" stroke="currentColor" strokeWidth="4" />,
  ]

  return (
    <div className="flex items-center justify-center w-full max-w-xs h-48">
      <svg viewBox="0 0 150 180" className="w-full h-full text-primary">
        {/* Gallow */}
        <line x1="10" y1="170" x2="50" y2="170" stroke="currentColor" strokeWidth="4" /> {/* Base */}
        <line x1="30" y1="170" x2="30" y2="10" stroke="currentColor" strokeWidth="4" /> {/* Vertical */}
        <line x1="30" y1="10" x2="100" y2="10" stroke="currentColor" strokeWidth="4" /> {/* Horizontal */}
        <line x1="100" y1="10" x2="100" y1="30" stroke="currentColor" strokeWidth="4" /> {/* Rope */}
        {/* Hangman Parts */}
        {parts.slice(0, incorrectGuesses)}
      </svg>
    </div>
  )
}
