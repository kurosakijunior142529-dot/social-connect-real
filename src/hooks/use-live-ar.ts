import { useCallback, useRef, useState } from "react";
import { LocalVideoTrack, Track, type Room } from "livekit-client";
import { CameraKitEngine } from "@/lib/ar/camera-kit-engine";
import { PassthroughEngine } from "@/lib/ar/passthrough-engine";
import { getArSetup, fetchArEffects } from "@/lib/ar/catalog.functions";
import { NORMAL_EFFECT, type ArEffect, type EffectEngine } from "@/lib/ar/types";

/**
 * Efeitos AR na live: a imagem já processada pelo motor vira a câmera
 * publicada no LiveKit. Em qualquer falha volta para a câmera normal.
 */
export function useLiveAr(room: Room | null, facing: "user" | "environment", video: HTMLVideoElement | null) {
  const engineRef = useRef<EffectEngine | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [effects, setEffects] = useState<ArEffect[]>([NORMAL_EFFECT]);
  const [effect, setEffect] = useState<ArEffect>(NORMAL_EFFECT);
  const [lenses, setLenses] = useState(false);

  const restoreCamera = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(true).catch(() => {});
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track && video) pub.track.attach(video);
  }, [room, video]);

  const stop = useCallback(async () => {
    if (room && trackRef.current) {
      await room.localParticipant.unpublishTrack(trackRef.current, false).catch(() => {});
    }
    trackRef.current = null;
    engineRef.current?.dispose();
    engineRef.current = null;
    setActive(false);
    setEffect(NORMAL_EFFECT);
    await restoreCamera();
  }, [room, restoreCamera]);

  const start = useCallback(async () => {
    if (!room) return false;
    setBusy(true);
    try {
      const [setup, list] = await Promise.all([
        getArSetup().catch(() => ({ apiToken: "", lensGroups: [] as string[], configured: false })),
        fetchArEffects().catch(() => [NORMAL_EFFECT]),
      ]);
      setEffects(list);
      // Libera a câmera crua antes do motor abrir a sua.
      await room.localParticipant.setCameraEnabled(false);
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) await room.localParticipant.unpublishTrack(camPub.track as any, true).catch(() => {});

      const opts = { facing, fps: 30 as const, width: 1280, height: 720, audio: false };
      let engine: EffectEngine | null = null;
      if (setup.configured) {
        try {
          engine = new CameraKitEngine(setup.apiToken, setup.lensGroups);
          await engine.startCamera(opts);
          setLenses(true);
        } catch {
          engine?.dispose();
          engine = null;
        }
      }
      if (!engine) {
        engine = new PassthroughEngine();
        await engine.startCamera(opts);
        setLenses(false);
      }
      const stream = engine.getOutputStream(30);
      const vt = stream?.getVideoTracks()[0];
      if (!vt) throw new Error("no-track");
      const track = new LocalVideoTrack(vt);
      await room.localParticipant.publishTrack(track, { source: Track.Source.Camera });
      engineRef.current = engine;
      trackRef.current = track;
      if (video) track.attach(video);
      setActive(true);
      return true;
    } catch {
      engineRef.current?.dispose();
      engineRef.current = null;
      await restoreCamera();
      return false;
    } finally {
      setBusy(false);
    }
  }, [room, facing, video, restoreCamera]);

  const select = useCallback(async (next: ArEffect) => {
    const engine = engineRef.current;
    setEffect(next);
    if (!engine?.supportsLenses) return;
    try {
      await engine.switchEffect(next);
    } catch {
      setEffect(NORMAL_EFFECT);
      await engine.unloadEffect().catch(() => {});
    }
  }, []);

  return { active, busy, effects, effect, lenses, start, stop, select };
}
