"use client";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISSED_KEY = "gatso-install-prompt-dismissed";
const ANDROID_FALLBACK_DELAY_MS = 2500;

type Platform = "ios" | "android";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectPlatform(): Platform | null {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIos) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Aviso de instalacion de la PWA (Fase 9): al entrar desde un navegador
 * movil (Android o iOS), explica como anadir Gatso a la pantalla de
 * inicio. No se muestra si la app ya esta instalada (modo standalone) ni
 * si ya se descarto antes (persistido en localStorage).
 *
 * iOS Safari no expone el evento `beforeinstallprompt`, asi que ahi
 * siempre se muestran instrucciones manuales (Compartir -> Anadir a
 * pantalla de inicio). En Android se escucha `beforeinstallprompt` para
 * ofrecer un boton de instalacion nativo; si el navegador no lo soporta
 * (p. ej. Firefox), tras una breve espera se muestran instrucciones
 * manuales igualmente.
 */
export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    const detected = detectPlatform();
    if (!detected) return;

    setPlatform(detected);

    if (detected === "ios") {
      setOpen(true);
      return;
    }

    const fallbackTimer = window.setTimeout(() => setOpen(true), ANDROID_FALLBACK_DELAY_MS);

    function handleBeforeInstallPrompt(event: Event) {
      window.clearTimeout(fallbackTimer);
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setOpen(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setOpen(false);
  }

  async function handleInstallClick() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    }
    setOpen(false);
  }

  if (!platform) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
        else setOpen(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instalar Gatso</DialogTitle>
          <DialogDescription>
            Anade Gatso a tu pantalla de inicio para acceder mas rapido, como si fuera una app.
          </DialogDescription>
        </DialogHeader>

        {platform === "ios" ? (
          <ol className="flex flex-col gap-3 text-sm text-foreground">
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                1
              </span>
              <span className="flex items-center gap-1.5">
                Toca <Share className="h-4 w-4" aria-hidden="true" /> Compartir en la barra de Safari.
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                2
              </span>
              <span className="flex items-center gap-1.5">
                Selecciona <SquarePlus className="h-4 w-4" aria-hidden="true" /> "Anadir a pantalla de inicio".
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                3
              </span>
              <span>Confirma pulsando "Anadir".</span>
            </li>
          </ol>
        ) : (
          <p className="text-sm text-foreground">
            {installEvent
              ? "Pulsa \"Instalar\" para anadir Gatso a tu dispositivo."
              : 'Abre el menu ⋮ de tu navegador y selecciona "Instalar aplicacion" o "Anadir a pantalla de inicio".'}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={dismiss}>
            Ahora no
          </Button>
          {platform === "android" && installEvent ? (
            <Button onClick={handleInstallClick}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Instalar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
