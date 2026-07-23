import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} not configured`);
  return v;
}

export function livekitUrl(): string {
  return env("LIVEKIT_URL");
}

export async function issueToken(opts: {
  identity: string;
  name?: string;
  room: string;
  canPublish: boolean;
  canPublishData?: boolean;
  metadata?: string;
}): Promise<string> {
  const at = new AccessToken(env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"), {
    identity: opts.identity,
    name: opts.name,
    metadata: opts.metadata,
    ttl: 60 * 60 * 6, // 6h
  });
  at.addGrant({
    room: opts.room,
    roomJoin: true,
    canPublish: opts.canPublish,
    canSubscribe: true,
    canPublishData: opts.canPublishData ?? true,
  });
  return await at.toJwt();
}

export function roomService(): RoomServiceClient {
  const url = env("LIVEKIT_URL").replace(/^wss?:/, "https:");
  return new RoomServiceClient(url, env("LIVEKIT_API_KEY"), env("LIVEKIT_API_SECRET"));
}
