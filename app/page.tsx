import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RoomCreationForm } from "@/components/room-creation-form"
import { RoomJoinForm } from "@/components/room-join-form"
import { ModeToggle } from "@/components/mode-toggle"

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-6 md:p-8 bg-background relative">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold text-center mb-6 sm:mb-8 text-primary drop-shadow-lg">
        Ahorcado Duo 🎮
      </h1>
      <div className="grid md:grid-cols-2 gap-6 sm:gap-8 w-full max-w-4xl">
        <Card className="card-base-style p-4 sm:p-6 flex flex-col items-center justify-center text-center">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl text-primary">Crear Sala</CardTitle>
            <CardDescription className="text-foreground/80 text-sm sm:text-base">
              Sé el anfitrión y comparte el código con tu partner.
            </CardDescription>
          </CardHeader>
          <CardContent className="w-full">
            <RoomCreationForm />
          </CardContent>
        </Card>

        <Card className="card-base-style p-4 sm:p-6 flex flex-col items-center justify-center text-center">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl text-primary">Unirse a Sala</CardTitle>
            <CardDescription className="text-foreground/80 text-sm sm:text-base">
              Usa el código de invitación para unirte a una partida existente.
            </CardDescription>
          </CardHeader>
          <CardContent className="w-full">
            <RoomJoinForm />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
