import { useState, useRef } from 'react'

const API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY
const GIPHY_ENDPOINT = 'https://api.giphy.com/v1/gifs/search'

export interface GiphyGif {
  id: string
  url: string
  title: string
  images: {
    fixed_height: { url: string }
    original: { url: string }
  }
}

export function useGiphy() {
  const [results, setResults] = useState<GiphyGif[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const searchGifs = async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        api_key: API_KEY || '',
        q: query,
        limit: '18',
        rating: 'pg',
        lang: 'es',
      })
      const res = await fetch(`${GIPHY_ENDPOINT}?${params.toString()}`)
      if (!res.ok) throw new Error('Error buscando GIFs')
      const data = await res.json()
      setResults(data.data)
    } catch (e: any) {
      setError(e.message || 'Error buscando GIFs')
    } finally {
      setLoading(false)
    }
  }

  // Búsqueda con debounce para experiencia en tiempo real
  const searchGifsDebounced = (query: string, delay = 400) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchGifs(query)
    }, delay)
  }

  return { results, loading, error, searchGifs, searchGifsDebounced }
}
