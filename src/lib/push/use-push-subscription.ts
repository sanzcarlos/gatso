"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";
import { urlBase64ToUint8Array } from "./client";

export type PushSupportState = "unsupported" | "unavailable" | "ready";

interface UsePushSubscriptionResult {
  /**
   * "unsupported": el navegador no soporta Service Worker/Push API.
   * "unavailable": el entorno no tiene VAPID configurado (`GET
   * /api/push/config` devuelve `publicKey: null`); el backend funciona
   * igual sin push, asi que se oculta el control en vez de mostrar un
   * error.
   * "ready": se puede activar/desactivar.
   */
  state: PushSupportState;
  subscribed: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
}

/**
 * Encapsula el ciclo de vida de una suscripcion push (Backlog:
 * "implementar notificaciones push"): consulta la clave publica VAPID y
 * si el usuario ya esta suscrito en este dispositivo, y expone un unico
 * `toggle()` que pide permiso/se suscribe o se desuscribe segun el estado
 * actual. Nunca se auto-suscribe sin una accion explicita del usuario
 * (pedir permiso de notificaciones sin interaccion esta bloqueado por la
 * mayoria de navegadores y, aunque no lo estuviera, seria una mala
 * practica).
 */
export function usePushSubscription(): UsePushSubscriptionResult {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    /**
     * Igual que `ServiceWorkerRegister`: el service worker solo se
     * registra en produccion (en `next dev` se recompila constantemente y
     * no hay `sw.js` activo), asi que fuera de produccion no tiene
     * sentido ofrecer el toggle (`navigator.serviceWorker.ready` se
     * quedaria esperando para siempre sin un SW registrado).
     */
    if (process.env.NODE_ENV !== "production") {
      setSupported(false);
      return;
    }
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }

    (async () => {
      const response = await apiFetch("/api/push/config");
      if (!response.ok) return;
      const data = await response.json();
      setPublicKey(data.publicKey ?? null);

      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        setSubscribed(Boolean(existing));
      } catch {
        setSubscribed(Boolean(data.subscribed));
      }
    })();
  }, []);

  const subscribe = useCallback(async () => {
    if (!publicKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    const response = await apiFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription.toJSON()),
    });
    if (response.ok) setSubscribed(true);
  }, [publicKey]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await apiFetch("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  }, []);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribe();
      } else {
        await subscribe();
      }
    } finally {
      setLoading(false);
    }
  }, [subscribed, subscribe, unsubscribe]);

  const state: PushSupportState = !supported ? "unsupported" : !publicKey ? "unavailable" : "ready";

  return { state, subscribed, loading, toggle };
}
