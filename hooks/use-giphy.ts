// hooks/use-giphy.ts
import { useState, useCallback } from 'react'

interface GiphyGif {
  id: string
  title: string
  images: {
    fixed_width: {
      url: string
      width: string
      height: string
    }
    fixed_height: {
      url: string
      width: string
      height: string
    }
    downsized: {
      url: string
      width: string
      height: string
    }
  }
}

interface GiphyResponse {
  data: GiphyGif[]
  pagination: {
    total_count: number
    count: number
    offset: number
  }
}

interface UseGiphyReturn {
  gifs: GiphyGif[]
  loading: boolean
  error: string | null
  searchGifs: (query: string) => Promise<void>
  getTrendingGifs: () => Promise<void>
  clearGifs: () => void
}

const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'YOUR_API_KEY_HERE'
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs'

export function useGiphy(): UseGiphyReturn {
  const [gifs, setGifs] = useState<GiphyGif[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const searchGifs = useCallback(async (query: string) => {
    if (!query.trim()) {
      setGifs([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${GIPHY_BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`
      )

      if (!response.ok) {
        throw new Error('Error al buscar GIFs')
      }

      const data: GiphyResponse = await response.json()
      setGifs(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setGifs([])
    } finally {
      setLoading(false)
    }
  }, [])

  const getTrendingGifs = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${GIPHY_BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=g`
      )

      if (!response.ok) {
        throw new Error('Error al obtener GIFs populares')
      }

      const data: GiphyResponse = await response.json()
      setGifs(data.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setGifs([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clearGifs = useCallback(() => {
    setGifs([])
    setError(null)
  }, [])

  return {
    gifs,
    loading,
    error,
    searchGifs,
    getTrendingGifs,
    clearGifs,
  }
}