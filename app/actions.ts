"use server"

import { createServerClient } from "@/lib/supabase"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function createUser(username: string) {
  const cookieStore = cookies()
  const supabase = createServerClient()

  const { data: existingUser, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .single()

  if (userError && userError.code !== "PGRST116") {
    // PGRST116 means no rows found
    console.error("Error checking existing user:", userError)
    return { success: false, error: userError.message }
  }

  let userId: string
  if (existingUser) {
    userId = existingUser.id
  } else {
    const { data, error } = await supabase.from("users").insert({ username }).select("id").single()

    if (error) {
      console.error("Error creating user:", error)
      return { success: false, error: error.message }
    }
    userId = data.id
  }

  // Store user ID in a cookie for session management
  cookieStore.set("user_id", userId, { httpOnly: true, secure: true, maxAge: 60 * 60 * 24 * 7 }) // 1 week
  cookieStore.set("username", username, { httpOnly: true, secure: true, maxAge: 60 * 60 * 24 * 7 }) // 1 week

  return { success: true, userId }
}

export async function createRoom(username: string) {
  const cookieStore = cookies()
  const supabase = createServerClient()

  const { success, userId, error: userCreationError } = await createUser(username)
  if (!success) {
    return { success: false, error: userCreationError }
  }

  const { data, error } = await supabase
    .from("rooms")
    .insert({ host_user_id: userId, state: "waiting" })
    .select("id")
    .single()

  if (error) {
    console.error("Error creating room:", error)
    return { success: false, error: error.message }
  }

  redirect(`/room/${data.id}`)
}

export async function joinRoom(roomId: string, username: string) {
  const cookieStore = cookies()
  const supabase = createServerClient()

  const { success, userId, error: userCreationError } = await createUser(username)
  if (!success) {
    return { success: false, error: userCreationError }
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, host_user_id, guest_user_id")
    .eq("id", roomId)
    .single()

  if (roomError || !room) {
    console.error("Error fetching room or room not found:", roomError)
    return { success: false, error: "Room not found or an error occurred." }
  }

  if (room.host_user_id === userId || room.guest_user_id === userId) {
    // User is already in the room, redirect directly
    redirect(`/room/${roomId}`)
  }

  if (room.guest_user_id) {
    return { success: false, error: "Room is already full." }
  }

  // Set guest_user_id and also set initial turn to guest
  const { error } = await supabase.from("rooms").update({ guest_user_id: userId, current_turn_user_id: userId }).eq("id", roomId)

  if (error) {
    console.error("Error joining room:", error)
    return { success: false, error: error.message }
  }

  redirect(`/room/${roomId}`)
}

export async function getRoomDetails(roomId: string) {
  const supabase = createServerClient()
  const cookieStore = cookies()
  const userId = cookieStore.get("user_id")?.value
  const username = cookieStore.get("username")?.value

  if (!userId) {
    return { room: null, currentUser: null, error: "User not logged in." }
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .select(`
    *,
    host:host_user_id(username),
    guest:guest_user_id(username),
    current_turn_user:current_turn_user_id(username)
  `)
    .eq("id", roomId)
    .single()

  if (error) {
    console.error("Error fetching room details:", error)
    return { room: null, currentUser: null, error: error.message }
  }

  const isHost = room.host_user_id === userId
  const isGuest = room.guest_user_id === userId

  if (!isHost && !isGuest) {
    return { room: null, currentUser: null, error: "You are not part of this room." }
  }

  return {
    room: {
      ...room,
      host_username: room.host?.username,
      guest_username: room.guest?.username,
      current_turn_username: room.current_turn_user?.username,
    },
    currentUser: { id: userId, username: username || "Guest" },
    error: null,
  }
}

export async function setWord(roomId: string, word: string) {
  const supabase = createServerClient()
  const cookieStore = cookies()
  const userId = cookieStore.get("user_id")?.value

  if (!userId) {
    return { success: false, error: "User not logged in." }
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("host_user_id, guest_user_id").eq("id", roomId).single()

  if (roomError || !room || room.host_user_id !== userId) {
    return { success: false, error: "Only the host can set the word." }
  }

  // Set initial turn to guest when word is set
  const { error } = await supabase.from("rooms").update({ word: word.toUpperCase(), state: "playing", current_turn_user_id: room.guest_user_id }).eq("id", roomId)

  if (error) {
    console.error("Error setting word:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function sendMove(roomId: string, letter: string, correct: boolean) {
  const supabase = createServerClient()
  const cookieStore = cookies()
  const userId = cookieStore.get("user_id")?.value

  if (!userId) {
    return { success: false, error: "User not logged in." }
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("host_user_id, guest_user_id, current_turn_user_id").eq("id", roomId).single()

  if (roomError || !room || room.current_turn_user_id !== userId) {
    return { success: false, error: "It's not your turn." }
  }

  const { error: moveError } = await supabase.from("moves").insert({ room_id: roomId, user_id: userId, letter, correct })

  if (moveError) {
    console.error("Error sending move:", moveError)
    return { success: false, error: moveError.message }
  }

  // If incorrect guess, switch turn
  if (!correct) {
    const nextTurnUserId = userId === room.host_user_id ? room.guest_user_id : room.host_user_id
    const { error: turnError } = await supabase.from("rooms").update({ current_turn_user_id: nextTurnUserId }).eq("id", roomId)
    if (turnError) {
      console.error("Error switching turn:", turnError)
      return { success: false, error: turnError.message }
    }
  }

  return { success: true }
}

export async function sendMessage(roomId: string, message: string) {
  const supabase = createServerClient()
  const cookieStore = cookies()
  const userId = cookieStore.get("user_id")?.value
  const username = cookieStore.get("username")?.value

  if (!userId || !username) {
    return { success: false, error: "User not logged in or username not found." }
  }

  const { error } = await supabase.from("messages").insert({ room_id: roomId, user_id: userId, message, username })

  if (error) {
    console.error("Error sending message:", error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getInitialMessages(roomId: string) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("messages")
    .select(`
    id, message, username, created_at
  `)
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching initial messages:", error)
    return []
  }
  return data
}

export async function getInitialMoves(roomId: string) {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from("moves")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching initial moves:", error)
    return []
  }
  return data
}

export async function leaveRoom(roomId: string) {
  const supabase = createServerClient()
  const cookieStore = cookies()
  const userId = cookieStore.get("user_id")?.value

  if (!userId) {
    return { success: false, error: "User not logged in." }
  }

  const { data: room, error: roomError } = await supabase.from("rooms").select("host_user_id").eq("id", roomId).single()

  if (roomError || !room) {
    return { success: false, error: "Room not found." }
  }

  if (room.host_user_id === userId) {
    // Host is leaving, close the room
    const { error } = await supabase.from("rooms").update({ state: "finished", guest_user_id: null, word: null, current_turn_user_id: null }).eq("id", roomId)
    if (error) {
      console.error("Error closing room:", error)
      return { success: false, error: error.message }
    }
  } else {
    // Guest is leaving
    const { error } = await supabase.from("rooms").update({ guest_user_id: null, current_turn_user_id: room.host_user_id }).eq("id", roomId) // Host gets turn back
    if (error) {
      console.error("Error leaving room:", error)
      return { success: false, error: error.message }
    }
  }

  redirect("/") // Redirect both host and guest to home page
}
