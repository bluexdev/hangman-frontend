"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { io, type Socket } from "socket.io-client"
import { useToast } from "@/components/ui/use-toast"

// IMPORTANT: Replace with your signaling server URL
// For local development, it will be "http://localhost:3000"
// For deployment, it will be the URL where you deploy your signaling server (e.g., "https://your-signaling-server.vercel.app")
const SIGNALING_SERVER_URL = process.env.NEXT_PUBLIC_SIGNALING_SERVER_URL || "http://localhost:3000"

export default function useVoice(roomId: string) {
  const { toast } = useToast()
  const localStream = useRef<MediaStream | null>(null)
  const peerConnection = useRef<RTCPeerConnection | null>(null)
  const socket = useRef<Socket | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setupPeerConnection = useCallback(() => {
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }, // Google's public STUN server
      ],
    })

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && socket.current) {
        socket.current.emit("candidate", { candidate: event.candidate, room: roomId })
      }
    }

    peerConnection.current.ontrack = (event) => {
      // When remote stream arrives, play it
      const audio = new Audio()
      audio.srcObject = event.streams[0]
      audio.play().catch((e) => console.error("Error playing remote audio:", e))
    }

    // Add local stream tracks if available
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current?.addTrack(track, localStream.current!)
      })
    }
  }, [roomId])

  const startRecording = async () => {
    if (isRecording || isConnecting) return

    setIsConnecting(true)
    setError(null)

    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      setIsRecording(true)

      socket.current = io(SIGNALING_SERVER_URL)

      socket.current.on("connect", () => {
        console.log("Connected to signaling server")
        socket.current?.emit("join", roomId)
        setIsConnecting(false)
      })

      socket.current.on("offer", async (data) => {
        console.log("Received offer:", data)
        if (!peerConnection.current) {
          setupPeerConnection()
        }
        await peerConnection.current!.setRemoteDescription(new RTCSessionDescription(data.offer))
        const answer = await peerConnection.current!.createAnswer()
        await peerConnection.current!.setLocalDescription(answer)
        socket.current?.emit("answer", { answer, room: roomId })
      })

      socket.current.on("answer", async (data) => {
        console.log("Received answer:", data)
        await peerConnection.current!.setRemoteDescription(new RTCSessionDescription(data.answer))
      })

      socket.current.on("candidate", async (data) => {
        console.log("Received ICE candidate:", data)
        try {
          await peerConnection.current!.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (e) {
          console.error("Error adding received ICE candidate:", e)
        }
      })

      socket.current.on("user-joined", async (id) => {
        console.log("User joined:", id, "Creating offer...")
        if (!peerConnection.current) {
          setupPeerConnection()
        }
        const offer = await peerConnection.current!.createOffer()
        await peerConnection.current!.setLocalDescription(offer)
        socket.current?.emit("offer", { offer, room: roomId })
      })

      socket.current.on("disconnect", () => {
        console.log("Disconnected from signaling server")
        setIsRecording(false)
        setIsConnecting(false)
        stopRecording() // Clean up local resources
      })

      socket.current.on("connect_error", (err) => {
        console.error("Signaling server connection error:", err)
        setError("Error de conexión con el servidor de voz.")
        setIsConnecting(false)
        stopRecording()
      })

      // Initial setup for the peer connection
      setupPeerConnection()
    } catch (err: any) {
      console.error("Error accessing microphone or starting voice:", err)
      setError(`Error al acceder al micrófono: ${err.message || "Permiso denegado o dispositivo no disponible."}`)
      setIsRecording(false)
      setIsConnecting(false)
    }
  }

  const stopRecording = useCallback(() => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop())
      localStream.current = null
    }
    if (peerConnection.current) {
      peerConnection.current.close()
      peerConnection.current = null
    }
    if (socket.current) {
      socket.current.disconnect()
      socket.current = null
    }
    setIsRecording(false)
    setIsConnecting(false)
    setError(null)
  }, [])

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopRecording()
    }
  }, [stopRecording])

  // Show toast for errors
  useEffect(() => {
    if (error) {
      toast({
        title: "Error de Voz",
        description: error,
        variant: "destructive",
      })
    }
  }, [error, toast])

  return { startRecording, stopRecording, isRecording, isConnecting, error }
}
