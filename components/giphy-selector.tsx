// components/giphy-selector.tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X, TrendingUp, Loader2 } from "lucide-react"
import { useGiphy } from "@/hooks/use-giphy"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface GiphySelectorProps {
  onSelectGifAction: (gifUrl: string) => void
  onCloseAction: () => void
  isMobile?: boolean
}

export function GiphySelector({ onSelectGifAction, onCloseAction, isMobile = false }: GiphySelectorProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const { gifs, loading, error, searchGifs, getTrendingGifs, clearGifs } = useGiphy()
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cargar GIFs trending al abrir
  useEffect(() => {
    getTrendingGifs()
    return () => {
      clearGifs()
    }
  }, [getTrendingGifs, clearGifs])

  // Buscar con debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      if (searchQuery.trim()) {
        searchGifs(searchQuery)
      } else {
        getTrendingGifs()
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, searchGifs, getTrendingGifs])

  const handleGifSelect = (gifUrl: string) => {
    onSelectGifAction(gifUrl)
    onCloseAction()
  }

  const handleTrendingClick = () => {
    setSearchQuery("")
    getTrendingGifs()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={cn(
        "absolute bottom-full left-0 right-0 bg-background border border-border rounded-xl shadow-lg mb-2 z-50",
        isMobile ? "h-80" : "h-96"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">G</span>
          </div>
          <span className={cn("font-medium", isMobile ? "text-sm" : "text-base")}>
            GIFs
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCloseAction}
          className={cn("hover:bg-muted", isMobile ? "h-8 w-8" : "h-9 w-9")}
        >
          <X className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className={cn(
            "absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground",
            isMobile ? "h-4 w-4" : "h-5 w-5"
          )} />
          <Input
            placeholder="Buscar GIFs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "pl-10 bg-muted/50 border-none focus:bg-background",
              isMobile ? "h-9 text-sm" : "h-10"
            )}
            style={isMobile ? { fontSize: '16px' } : {}}
          />
          {!searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleTrendingClick}
              className={cn(
                "absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground",
                isMobile ? "h-7 px-2" : "h-8 px-3"
              )}
            >
              <TrendingUp className={cn(isMobile ? "h-3 w-3" : "h-4 w-4")} />
              <span className={cn("ml-1", isMobile ? "text-xs" : "text-sm")}>
                Trending
              </span>
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 max-h-64">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p className={cn(isMobile ? "text-sm" : "text-base")}>
              {error}
            </p>
          </div>
        )}

        {!loading && !error && gifs.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p className={cn(isMobile ? "text-sm" : "text-base")}>
              No se encontraron GIFs
            </p>
          </div>
        )}

        {!loading && !error && gifs.length > 0 && (
          <div className={cn(
            "grid gap-2",
            isMobile ? "grid-cols-2" : "grid-cols-3"
          )}>
            <AnimatePresence>
              {gifs.map((gif) => (
                <motion.button
                  key={gif.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleGifSelect(gif.images.fixed_width.url)}
                  className={cn(
                    "relative overflow-hidden rounded-lg bg-muted hover:bg-muted/80 transition-colors",
                    isMobile ? "aspect-square" : "aspect-video"
                  )}
                >
                  <img
                    src={gif.images.fixed_width.url}
                    alt={gif.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}