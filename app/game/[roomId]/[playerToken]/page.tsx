import { GamePageClient } from "@/src/components/game/GamePageClient";

type GamePageProps = {
  params: Promise<{
    roomId: string;
    playerToken: string;
  }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { roomId, playerToken } = await params;

  return <GamePageClient roomId={roomId} playerToken={playerToken} />;
}
