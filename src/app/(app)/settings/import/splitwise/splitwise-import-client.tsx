"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Link2, Link2Off, RefreshCw, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InviteMemberDialog } from "@/app/(app)/groups/[groupId]/invite-member-dialog";

interface SplitwiseGroupOption {
  externalId: string;
  name: string;
  memberCount: number;
}

interface ImportPreview {
  sourceGroupExternalId: string;
  sourceGroupName: string;
  participants: { externalId: string; displayName: string }[];
  dateRange: { earliest: string | null; latest: string | null };
  currencies: { currencyCode: string; expenseCount: number }[];
  expenseCount: number;
  paymentCount: number;
  deletedCount: number;
  multiPayerExpenseCount: number;
  unsupportedDataCounts: { withReceipts: number; withComments: number; recurring: number };
  truncated: boolean;
}

interface GatsoGroupOption {
  id: string;
  name: string;
}

interface KnownUser {
  userId: string;
  displayName: string;
}

interface ImportJob {
  id: string;
  status: "draft" | "preview" | "running" | "completed" | "partial" | "failed" | "cancelled";
  targetGroupId: string | null;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  errorSummary: string | null;
}

interface ImportJobError {
  id: string;
  entityType: string;
  externalId: string | null;
  message: string;
  recoverable: boolean;
}

interface ReconciliationReport {
  matches: boolean;
  checkedUserCount: number;
  discrepancies: { currencyCode: string; gatsoUserId: string; splitwiseCents: number; gatsoCents: number; diffCents: number }[];
  truncated: boolean;
}

const RUNNING_STATUSES = new Set(["draft", "preview", "running"]);
const TERMINAL_NON_CANCELLED_STATUSES = new Set(["completed", "partial", "failed"]);

const STATUS_LABEL: Record<ImportJob["status"], string> = {
  draft: "Iniciando",
  preview: "Vista previa",
  running: "En curso",
  completed: "Completado",
  partial: "Completado con avisos",
  failed: "Fallido",
  cancelled: "Cancelado",
};

const STATUS_VARIANT: Record<ImportJob["status"], "outline" | "secondary" | "success" | "warning" | "destructive"> = {
  draft: "secondary",
  preview: "secondary",
  running: "secondary",
  completed: "success",
  partial: "warning",
  failed: "destructive",
  cancelled: "outline",
};

/**
 * Asistente de importacion desde Splitwise (Fase 11). Flujo secuencial:
 * conectar cuenta -> elegir grupo Splitwise -> vista previa (solo
 * lectura) -> elegir/crear destino en Gatso -> mapear participantes ->
 * crear job (procesa el primer lote) -> seguir progreso hasta terminar.
 *
 * El grupo destino se crea (o se elige uno existente) ANTES de mapear
 * participantes, no al confirmar la importacion: asi el mapeo siempre
 * trabaja sobre un grupo Gatso real. El desplegable de mapeo ofrece
 * cualquier usuario con el que el importador ya comparta otro grupo
 * (`listKnownUsers`), no solo los miembros actuales del grupo destino:
 * si se elige a alguien que aun no es miembro, se anade automaticamente
 * al confirmar (`ensureGroupMembers` en el servicio). Para participantes
 * sin ninguna cuenta Gatso todavia, "Invitar a alguien nuevo" genera un
 * enlace de invitacion (no crea cuentas con contrasenas ficticias, deben
 * aceptarlo ellos mismos); tras aceptarlo, "Actualizar lista" los incluye
 * en el desplegable. Los gastos con participantes sin mapear no bloquean
 * el resto de la importacion: se registran como error individual en el
 * informe del job.
 */
export default function SplitwiseImportClient() {
  const searchParams = useSearchParams();

  const [connected, setConnected] = useState<boolean | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const [splitwiseGroups, setSplitwiseGroups] = useState<SplitwiseGroupOption[] | null>(null);
  const [sourceGroupExternalId, setSourceGroupExternalId] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const [createMode, setCreateMode] = useState<"create" | "existing">("create");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [adminGroups, setAdminGroups] = useState<GatsoGroupOption[] | null>(null);
  const [targetGroupId, setTargetGroupId] = useState("");
  const [targetGroupName, setTargetGroupName] = useState("");

  const [knownUsers, setKnownUsers] = useState<KnownUser[] | null>(null);
  const [loadingKnownUsers, setLoadingKnownUsers] = useState(false);

  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [creatingJob, setCreatingJob] = useState(false);

  const [job, setJob] = useState<ImportJob | null>(null);
  const [jobErrors, setJobErrors] = useState<ImportJobError[]>([]);
  const [polling, setPolling] = useState(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [checkingReconciliation, setCheckingReconciliation] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const loadConnection = useCallback(async () => {
    const response = await apiFetch("/api/imports/splitwise/connection");
    if (response.ok) {
      const data = await response.json();
      setConnected(Boolean(data.connected));
    }
  }, []);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    const connectedParam = searchParams.get("connected");
    const errorParam = searchParams.get("error");
    if (connectedParam) toast.success("Cuenta de Splitwise conectada");
    if (errorParam === "not_configured") toast.error("La importacion desde Splitwise no esta configurada en este entorno");
    else if (errorParam === "invalid_state") toast.error("La conexion caduco, intentalo de nuevo");
    else if (errorParam === "access_denied") toast.error("Autorizacion cancelada en Splitwise");
    else if (errorParam) toast.error("No se pudo conectar con Splitwise");
  }, [searchParams]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const response = await apiFetch("/api/imports/splitwise/connection", { method: "DELETE" });
      if (!response.ok) {
        toast.error("No se pudo desconectar Splitwise");
        return;
      }
      toast.success("Cuenta de Splitwise desconectada");
      setConnected(false);
      setSplitwiseGroups(null);
      setPreview(null);
    } finally {
      setDisconnecting(false);
    }
  }

  async function loadSplitwiseGroups() {
    const response = await apiFetch("/api/imports/splitwise/groups");
    if (!response.ok) {
      toast.error("No se pudieron cargar los grupos de Splitwise");
      return;
    }
    const data = await response.json();
    setSplitwiseGroups(data.groups);
  }

  useEffect(() => {
    if (connected) void loadSplitwiseGroups();
  }, [connected]);

  async function handlePreview(externalId: string) {
    setSourceGroupExternalId(externalId);
    setPreview(null);
    setLoadingPreview(true);
    try {
      const response = await apiFetch("/api/imports/splitwise/preview", {
        method: "POST",
        body: JSON.stringify({ sourceGroupExternalId: externalId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo generar la vista previa");
        return;
      }
      const data = await response.json();
      setPreview(data.preview);
      setNewGroupName(data.preview.sourceGroupName);
    } finally {
      setLoadingPreview(false);
    }
  }

  const loadAdminGroups = useCallback(async () => {
    const response = await apiFetch("/api/groups");
    if (!response.ok) return;
    const data = await response.json();
    const admin = (data.groups as { group: { id: string; name: string }; role: string }[])
      .filter((row) => row.role === "admin")
      .map((row) => ({ id: row.group.id, name: row.group.name }));
    setAdminGroups(admin);
  }, []);

  useEffect(() => {
    if (createMode === "existing" && preview && !targetGroupId) void loadAdminGroups();
  }, [createMode, preview, targetGroupId, loadAdminGroups]);

  const loadKnownUsers = useCallback(async () => {
    setLoadingKnownUsers(true);
    try {
      const response = await apiFetch("/api/users/known");
      if (!response.ok) return;
      const data = await response.json();
      setKnownUsers(data.users.map((u: { id: string; displayName: string }) => ({ userId: u.id, displayName: u.displayName })));
    } finally {
      setLoadingKnownUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadKnownUsers();
  }, [loadKnownUsers]);

  async function handleCreateGroupNow() {
    if (!newGroupName.trim()) {
      toast.error("Ponle un nombre al grupo nuevo");
      return;
    }
    setCreatingGroup(true);
    try {
      const response = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear el grupo");
        return;
      }
      const data = await response.json();
      setTargetGroupId(data.group.id);
      setTargetGroupName(data.group.name);
      toast.success("Grupo creado");
      await loadKnownUsers();
    } finally {
      setCreatingGroup(false);
    }
  }

  function handleSelectExistingGroup(groupId: string) {
    setTargetGroupId(groupId);
    setTargetGroupName(adminGroups?.find((g) => g.id === groupId)?.name ?? "");
  }

  function handleMappingChange(externalId: string, gatsoUserId: string) {
    setMappings((current) => {
      const next = { ...current };
      if (gatsoUserId) next[externalId] = gatsoUserId;
      else delete next[externalId];
      return next;
    });
  }

  function stopPolling() {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    pollTimeoutRef.current = null;
    setPolling(false);
  }

  const fetchJobStatus = useCallback(async (jobId: string) => {
    const response = await apiFetch(`/api/imports/splitwise/jobs/${jobId}`);
    if (!response.ok) return null;
    return response.json();
  }, []);

  const scheduleContinue = useCallback(
    (jobId: string) => {
      pollTimeoutRef.current = setTimeout(async () => {
        const response = await apiFetch(`/api/imports/splitwise/jobs/${jobId}/retry`, { method: "POST" });
        if (!response.ok) {
          stopPolling();
          return;
        }
        const data = await response.json();
        setJob(data.job);
        if (RUNNING_STATUSES.has(data.job.status)) {
          scheduleContinue(jobId);
        } else {
          stopPolling();
          const statusData = await fetchJobStatus(jobId);
          if (statusData) setJobErrors(statusData.errors ?? []);
          toast.success("Importacion terminada");
        }
      }, 1500);
    },
    [fetchJobStatus],
  );

  useEffect(() => () => stopPolling(), []);

  async function handleCreateJob() {
    if (!preview) return;
    if (!targetGroupId) {
      toast.error("Elige o crea primero el grupo Gatso destino");
      return;
    }
    const participantMappings = Object.entries(mappings).map(([externalId, gatsoUserId]) => ({ externalId, gatsoUserId }));
    if (participantMappings.length === 0) {
      toast.error("Mapea al menos un participante");
      return;
    }

    setCreatingJob(true);
    try {
      const response = await apiFetch("/api/imports/splitwise/jobs", {
        method: "POST",
        body: JSON.stringify({
          sourceGroupExternalId: preview.sourceGroupExternalId,
          sourceGroupName: preview.sourceGroupName,
          createMode: "existing",
          targetGroupId,
          participantMappings,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear la importacion");
        return;
      }
      const data = await response.json();
      setJob(data.job);
      if (RUNNING_STATUSES.has(data.job.status)) {
        setPolling(true);
        scheduleContinue(data.job.id);
      } else {
        const statusData = await fetchJobStatus(data.job.id);
        if (statusData) setJobErrors(statusData.errors ?? []);
      }
    } finally {
      setCreatingJob(false);
    }
  }

  async function handleCancelJob() {
    if (!job) return;
    const response = await apiFetch(`/api/imports/splitwise/jobs/${job.id}/cancel`, { method: "POST" });
    if (!response.ok) {
      toast.error("No se pudo cancelar la importacion");
      return;
    }
    stopPolling();
    const data = await response.json();
    setJob(data.job);
  }

  async function handleCheckReconciliation() {
    if (!job) return;
    setCheckingReconciliation(true);
    try {
      const response = await apiFetch(`/api/imports/splitwise/jobs/${job.id}/reconciliation`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo comprobar la reconciliacion");
        return;
      }
      const data = await response.json();
      setReconciliation(data.report);
      if (data.report.matches) {
        toast.success("Los balances coinciden exactamente");
      } else {
        toast.warning("Se encontraron diferencias, revisa el detalle");
      }
    } finally {
      setCheckingReconciliation(false);
    }
  }

  async function handleRollback() {
    if (!job) return;
    if (!window.confirm("¿Revertir esta importacion? Se borraran los gastos y pagos creados por ella que no se hayan editado despues.")) {
      return;
    }
    setRollingBack(true);
    try {
      const response = await apiFetch(`/api/imports/splitwise/jobs/${job.id}/rollback`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo revertir la importacion");
        return;
      }
      const data = await response.json();
      toast.success(
        `Revertido: ${data.report.deletedExpenses} gastos y ${data.report.deletedPayments} pagos borrados` +
          (data.report.protectedCount > 0 ? ` (${data.report.protectedCount} protegidos por estar editados)` : ""),
      );
      setReconciliation(null);
    } finally {
      setRollingBack(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/groups" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Volver a mis grupos
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Importar desde Splitwise</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Migra grupos, gastos y pagos ya registrados en Splitwise a Gatso. La importacion es unidireccional (Splitwise
          → Gatso): nunca se modifica ni se borra nada en Splitwise.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Conexion con Splitwise</CardTitle>
          <CardDescription>Solo lectura. Puedes desconectar la cuenta en cualquier momento.</CardDescription>
        </CardHeader>
        <CardContent>
          {connected === null ? (
            <Skeleton className="h-9 w-48" />
          ) : connected ? (
            <div className="flex items-center gap-3">
              <Badge variant="success">Conectado</Badge>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                <Link2Off className="h-4 w-4" />
                {disconnecting ? "Desconectando..." : "Desconectar"}
              </Button>
            </div>
          ) : (
            <Button asChild>
              <a href="/api/imports/splitwise/oauth/start">
                <Link2 className="h-4 w-4" />
                Conectar con Splitwise
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {connected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Elige el grupo de Splitwise</CardTitle>
            <CardDescription>Se genera una vista previa (solo lectura) antes de escribir nada en Gatso.</CardDescription>
          </CardHeader>
          <CardContent>
            {splitwiseGroups === null ? (
              <Skeleton className="h-9 w-64" />
            ) : splitwiseGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No se encontraron grupos en tu cuenta de Splitwise.</p>
            ) : (
              <Select value={sourceGroupExternalId} onValueChange={handlePreview}>
                <SelectTrigger className="w-72" aria-label="Grupo de Splitwise">
                  <SelectValue placeholder="Selecciona un grupo" />
                </SelectTrigger>
                <SelectContent>
                  {splitwiseGroups.map((group) => (
                    <SelectItem key={group.externalId} value={group.externalId}>
                      {group.name} ({group.memberCount} miembros)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {loadingPreview ? <Skeleton className="mt-4 h-24 w-full" /> : null}
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vista previa: {preview.sourceGroupName}</CardTitle>
            {preview.truncated ? (
              <CardDescription className="text-warning">
                Se alcanzo el limite de paginas de seguridad; la vista previa es parcial.
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 text-sm">
              <p><strong>{preview.expenseCount}</strong> gastos, <strong>{preview.paymentCount}</strong> pagos registrados</p>
              <p><strong>{preview.deletedCount}</strong> gastos borrados en Splitwise (se omitiran)</p>
              <p>
                Rango de fechas: {preview.dateRange.earliest?.slice(0, 10) ?? "-"} a {preview.dateRange.latest?.slice(0, 10) ?? "-"}
              </p>
              <p>Monedas: {preview.currencies.map((c) => `${c.currencyCode} (${c.expenseCount})`).join(", ") || "-"}</p>
              {preview.multiPayerExpenseCount > 0 ? (
                <p>
                  <strong>{preview.multiPayerExpenseCount}</strong> gastos con varios pagadores: se importaran como
                  varios gastos enlazados en Gatso (un gasto por pagador) para conservar exactamente los saldos.
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Datos que Gatso no importa:</p>
              <p>{preview.unsupportedDataCounts.withReceipts} gastos con recibo adjunto</p>
              <p>{preview.unsupportedDataCounts.withComments} gastos con hilo de comentarios/discusion</p>
              <p>{preview.unsupportedDataCounts.recurring} series recurrentes (se importa cada gasto ya generado, no la recurrencia en si)</p>
              <p>Las categorias de Splitwise tampoco se importan (Gatso no tiene un concepto equivalente).</p>
              <p className="text-foreground">
                Las notas de cada gasto (campo "Detalles" en Splitwise) si se importan, como comentario del gasto en
                Gatso.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {preview && !targetGroupId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Destino en Gatso</CardTitle>
            <CardDescription>El grupo debe existir antes de mapear participantes.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2">
              <Button variant={createMode === "create" ? "default" : "outline"} size="sm" onClick={() => setCreateMode("create")}>
                Crear grupo nuevo
              </Button>
              <Button variant={createMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setCreateMode("existing")}>
                Importar en un grupo existente
              </Button>
            </div>

            {createMode === "create" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-group-name">Nombre del grupo nuevo</Label>
                <div className="flex gap-2">
                  <Input id="new-group-name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} maxLength={64} />
                  <Button onClick={handleCreateGroupNow} disabled={creatingGroup}>
                    {creatingGroup ? "Creando..." : "Crear grupo"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="existing-group">Grupo Gatso (debes ser administrador)</Label>
                {adminGroups === null ? (
                  <Skeleton className="h-9 w-64" />
                ) : adminGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No administras ningun grupo todavia.</p>
                ) : (
                  <Select value={targetGroupId} onValueChange={handleSelectExistingGroup}>
                    <SelectTrigger className="w-72" aria-label="Grupo Gatso existente">
                      <SelectValue placeholder="Selecciona un grupo" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {preview && targetGroupId ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              4. Mapea los participantes
              <Badge variant="secondary">Destino: {targetGroupName}</Badge>
            </CardTitle>
            <CardDescription>
              El desplegable incluye a cualquier persona con la que ya compartes otro grupo en Gatso. Si eliges a
              alguien que aun no es miembro de "{targetGroupName}", se anadira automaticamente al confirmar. Para
              quien todavia no tenga cuenta en Gatso, puedes usar "Invitar" junto a su nombre ahora mismo, o dejarlo
              sin mapear: durante la importacion se generara automaticamente una invitacion pendiente para cada
              participante sin cuenta (visible y compartible desde "Ver invitaciones pendientes" en el paso 5).
              Cuando la acepte, vuelve a importar el mismo grupo de Splitwise para completar sus gastos. Ningun
              emparejamiento se hace por nombre automaticamente: revisa cada persona.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center gap-2">
              <InviteMemberDialog groupId={targetGroupId} />
              <Button variant="outline" size="sm" onClick={loadKnownUsers} disabled={loadingKnownUsers}>
                <RefreshCw className={loadingKnownUsers ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Actualizar lista
              </Button>
            </div>
            {loadingKnownUsers && knownUsers === null ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="flex flex-col gap-3">
                {preview.participants.map((participant) => (
                  <div key={participant.externalId} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{participant.displayName}</span>
                    <div className="flex items-center gap-2">
                      {!mappings[participant.externalId] ? (
                        <InviteMemberDialog
                          groupId={targetGroupId}
                          initialSuggestedDisplayName={participant.displayName}
                          triggerLabel="Invitar"
                        />
                      ) : null}
                      <Select
                        value={mappings[participant.externalId] ?? ""}
                        onValueChange={(value) => handleMappingChange(participant.externalId, value)}
                      >
                        <SelectTrigger className="w-56" aria-label={`Mapear ${participant.displayName}`}>
                          <SelectValue placeholder="Sin mapear" />
                        </SelectTrigger>
                        <SelectContent>
                          {(knownUsers ?? []).map((user) => (
                            <SelectItem key={user.userId} value={user.userId}>
                              {user.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={handleCreateJob} disabled={creatingJob}>
              {creatingJob ? "Creando importacion..." : "Confirmar e importar"}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {job ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              5. Progreso
              <Badge variant={STATUS_VARIANT[job.status]}>{STATUS_LABEL[job.status]}</Badge>
              {polling ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Importados: <strong>{job.importedCount}</strong> · Omitidos: <strong>{job.skippedCount}</strong> · Fallidos:{" "}
              <strong>{job.failedCount}</strong>
            </p>
            {job.errorSummary ? <p className="text-destructive">{job.errorSummary}</p> : null}
            {jobErrors.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                <p className="font-medium text-foreground">Errores individuales:</p>
                {jobErrors.map((error) => (
                  <p key={error.id} className="text-xs text-muted-foreground">
                    [{error.entityType}{error.externalId ? ` ${error.externalId}` : ""}] {error.message}
                  </p>
                ))}
              </div>
            ) : null}
            {job.targetGroupId ? (
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/groups/${job.targetGroupId}`} className="text-primary underline-offset-4 hover:underline">
                  Ver grupo en Gatso
                </Link>
                {jobErrors.length > 0 ? (
                  <InviteMemberDialog groupId={job.targetGroupId} triggerLabel="Ver invitaciones pendientes" />
                ) : null}
              </div>
            ) : null}
            {jobErrors.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Los participantes sin cuenta Gatso todavia tienen una invitacion pendiente generada automaticamente:
                compartela desde "Ver invitaciones pendientes" y vuelve a importar cuando la acepten para completar
                sus gastos.
              </p>
            ) : null}
            {reconciliation ? (
              <div className="mt-2 flex flex-col gap-1 rounded-md border border-border p-3">
                <p className="font-medium text-foreground">
                  {reconciliation.matches
                    ? "Los balances de Splitwise y Gatso coinciden exactamente."
                    : `Se encontraron ${reconciliation.discrepancies.length} discrepancias:`}
                </p>
                {reconciliation.discrepancies.map((d, index) => (
                  <p key={index} className="text-xs text-muted-foreground">
                    {d.currencyCode} · usuario {d.gatsoUserId}: Splitwise {(d.splitwiseCents / 100).toFixed(2)}, Gatso{" "}
                    {(d.gatsoCents / 100).toFixed(2)} (diferencia {(d.diffCents / 100).toFixed(2)})
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {RUNNING_STATUSES.has(job.status) ? (
              <Button variant="outline" size="sm" onClick={handleCancelJob}>
                <XCircle className="h-4 w-4" />
                Cancelar importacion
              </Button>
            ) : null}
            {TERMINAL_NON_CANCELLED_STATUSES.has(job.status) ? (
              <>
                <Button variant="outline" size="sm" onClick={handleCheckReconciliation} disabled={checkingReconciliation}>
                  {checkingReconciliation ? "Comprobando..." : "Comprobar balances"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleRollback} disabled={rollingBack}>
                  {rollingBack ? "Revirtiendo..." : "Revertir importacion"}
                </Button>
              </>
            ) : null}
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
