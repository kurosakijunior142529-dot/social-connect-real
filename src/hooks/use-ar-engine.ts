import { useCallback, useEffect, useRef, useState } from "react";
import { CameraKitEngine } from "@/lib/ar/camera-kit-engine";
import { PassthroughEngine } from "@/lib/ar/passthrough-engine";
import { bumpArEffectUsage, fetchArEffects, getArSetup } from "@/lib/ar/catalog.functions";
import {
  ArEngineError,
  NORMAL_EFFECT,
  type ArEffect,
  type ArEngineErrorKind,
  type ArEngineStatus,
  type ArStartOptions,
  type CameraFacing,
  type EffectEngine,
} from "@/lib/ar/types";

type Options = { facing: CameraFacing; fps: 30 | 60; enabled?: boolean };

/** Ciclo de vida do motor de efeitos: iniciar, trocar efeito, liberar. */
export function useArEngine({ facing, fps, enabled = true }: Options) {
  const engineRef = useRef<EffectEngine | null>(null);
  const [status, setStatus] = useState<ArEngineStatus>("idle");
  const [errorKind, setErrorKind] = useState<ArEngineErrorKind | null>(null);
  const [effects, setEffects] = useState<ArEffect[]>([NORMAL_EFFECT]);
  const [effect, setEffect] = useState<ArEffect>(NORMAL_EFFECT);
  const [lensesAvailable, setLensesAvailable] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void fetchArEffects().then((list) => alive && setEffects(list));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let engine: EffectEngine | null = null;

    void (async () => {
      setStatus("initializing");
      setErrorKind(null);
      const setup = await getArSetup().catch(() => ({ apiToken: "", lensGroups: [], configured: false }));
      if (!alive) return;
      const options: ArStartOptions = { facing, fps, width: 1280, height: 720 };

      if (setup.configured) {
        try {
          engine = new CameraKitEngine(setup.apiToken, setup.lensGroups);
          await engine.startCamera(options);
          if (!alive) return engine.dispose();
          setLensesAvailable(true);
        } catch (err) {
          engine?.dispose();
          engine = null;
          const kind = err instanceof ArEngineError ? err.kind : "unknown";
          if (kind === "permission-denied") {
            setStatus("error");
            setErrorKind(kind);
            return;
          }
          setErrorKind(kind);
        }
      } else {
        setErrorKind("sdk-not-configured");
      }

      if (!engine) {
        try {
          engine = new PassthroughEngine();
          await engine.startCamera(options);
          if (!alive) return engine.dispose();
          setLensesAvailable(false);
        } catch (err) {
          setStatus("error");
          setErrorKind(err instanceof ArEngineError ? err.kind : "camera-unavailable");
          return;
        }
      }

      engineRef.current = engine;
      setVersion((v) => v + 1);
      setStatus("ready");
    })();

    return () => {
      alive = false;
      engineRef.current?.dispose();
      engineRef.current = null;
      setStatus("idle");
    };
  }, [enabled, facing, fps]);

  const selectEffect = useCallback(
    async (next: ArEffect) => {
      const engine = engineRef.current;
      setEffect(next);
      if (!engine || !engine.supportsLenses) return;
      setStatus("loading-effect");
      try {
        await engine.switchEffect(next);
        setStatus("ready");
        void bumpArEffectUsage(next.id);
      } catch (err) {
        setEffect(NORMAL_EFFECT);
        await engine.unloadEffect().catch(() => {});
        setStatus("ready");
        setErrorKind(err instanceof ArEngineError ? err.kind : "effect-incompatible");
      }
    },
    [],
  );

  return {
    engine: engineRef.current,
    engineVersion: version,
    status,
    errorKind,
    effects,
    effect,
    selectEffect,
    lensesAvailable,
    setStatus,
  };
}
