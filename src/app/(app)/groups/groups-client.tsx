"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { getCache, setCache } from "@/lib/offline/db";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowUpRight, Crown, Plus, TicketCheck, UsersRound } from "lucide-react";

interface GroupRow {
  group: { id: string; name: string; inviteCode: string };
  role: "admin" | "member";
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

const GROUPS_CACHE_KEY = "groups-list";

export default function GroupsClient() {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState("EUR");
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/currencies")
      .then((r) => (r.ok ? r.json() : { currencies: [] }))
      .then((data) => setCurrencies(data.currencies ?? []))
      .catch(() => setCurrencies([]));
  }, []);

  async function loadGroups() {
    try {
      const response = await apiFetch("/api/groups");
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups as GroupRow[]);
        setOffline(false);
        await setCache(GROUPS_CACHE_KEY, data.groups as GroupRow[]);
      }
    } catch {
      const cached = await getCache<GroupRow[]>(GROUPS_CACHE_KEY);
      if (cached) setGroups(cached);
      setOffline(true);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: newGroupName, baseCurrencyCode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear el grupo");
        return;
      }
      setNewGroupName("");
      setBaseCurrencyCode("EUR");
      setCreateDialogOpen(false);
      toast.success("Grupo creado");
      await loadGroups();
    } catch {
      toast.error("Sin conexion: no se pueden crear grupos sin conexion");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    try {
      const response = await apiFetch("/api/groups/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo unir al grupo");
        return;
      }
      setInviteCode("");
      setJoinDialogOpen(false);
      toast.success("Te has unido al grupo");
      await loadGroups();
    } catch {
      toast.error("Sin conexion: no te puedes unir a un grupo sin conexion");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary-ink">Panel principal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Mis grupos</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Crea un espacio para un viaje, una casa o cualquier plan compartido.
          </p>
        </div>
        {groups !== null ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/75 px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
            <UsersRound className="h-4 w-4 text-primary-ink" />
            {groups.length === 1 ? "1 grupo activo" : `${groups.length} grupos activos`}
          </div>
        ) : null}
      </header>

      {offline ? <OfflineBanner hasCachedData={groups !== null} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus /> Crear grupo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear un grupo</DialogTitle>
              <DialogDescription>Empieza desde cero y comparte el codigo con los participantes.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-5" onSubmit={handleCreate}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-group-name">Nombre del grupo</Label>
                <Input
                  id="new-group-name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Viaje a la playa"
                  maxLength={64}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-group-currency">Moneda base</Label>
                <Select value={baseCurrencyCode} onValueChange={setBaseCurrencyCode}>
                  <SelectTrigger id="new-group-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(currencies.length > 0 ? currencies : [{ code: "EUR", name: "Euro", symbol: "€" }]).map(
                      (currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code} ({currency.symbol})
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creando..." : "Crear grupo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" variant="secondary">
              <TicketCheck /> Unirme a un grupo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unirme a un grupo</DialogTitle>
              <DialogDescription>Pega el codigo de la invitacion que te han enviado.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-5" onSubmit={handleJoin}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">Codigo de invitacion</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="ABCD123456"
                  className="font-mono uppercase tracking-widest"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" variant="secondary" disabled={joining}>
                  {joining ? "Uniendome..." : "Unirme"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">Tus espacios</h2>
            <p className="mt-1 text-sm text-muted-foreground">Abre un grupo para consultar gastos, balances y actividad.</p>
          </div>
        </div>
        {groups === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"><UsersRound className="h-6 w-6" /></span>
            <h3 className="mt-4 font-semibold text-foreground">Aun no tienes grupos</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Crea el primero o usa un codigo de invitacion para empezar a compartir gastos.</p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map(({ group, role }) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`} className="group block h-full">
                  <Card className="h-full overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-primary-ink/30 hover:shadow-md">
                    <CardContent className="flex h-full min-h-36 flex-col justify-between p-5">
                      <div className="flex items-start justify-between gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary font-bold text-primary-foreground">{group.name.slice(0, 1).toUpperCase()}</span>
                        <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-ink" />
                      </div>
                      <div className="mt-5">
                        <span className="line-clamp-1 text-lg font-bold tracking-tight text-foreground">{group.name}</span>
                        <Badge className="mt-2 gap-1" variant={role === "admin" ? "default" : "secondary"}>
                          {role === "admin" ? <Crown className="h-3 w-3" /> : null}
                          {role === "admin" ? "Administrador" : "Miembro"}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
