"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimalDigits: number;
  isActive: boolean;
}

const MAX_ACTIVE_CURRENCIES = 16;

export default function AdminCurrenciesClient() {
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimalDigits, setDecimalDigits] = useState("2");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/currencies");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo cargar el catalogo de monedas");
      return;
    }
    const data = await response.json();
    setCurrencies(data.currencies);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = currencies?.filter((c) => c.isActive).length ?? 0;

  function resetForm() {
    setCode("");
    setName("");
    setSymbol("");
    setDecimalDigits("2");
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await apiFetch("/api/admin/currencies", {
        method: "POST",
        body: JSON.stringify({ code, name, symbol, decimalDigits: Number(decimalDigits) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear la moneda");
        return;
      }
      resetForm();
      toast.success("Moneda creada");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(currency: Currency) {
    const nextActive = !currency.isActive;
    const response = await apiFetch(`/api/admin/currencies/${currency.code}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo actualizar la moneda");
      return;
    }
    toast.success(nextActive ? "Moneda activada" : "Moneda desactivada");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/groups"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a mis grupos
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Administracion de monedas</h1>
        <Badge variant={activeCount >= MAX_ACTIVE_CURRENCIES ? "warning" : "outline"}>
          {activeCount} / {MAX_ACTIVE_CURRENCIES} activas
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Anadir moneda</CardTitle>
          <CardDescription>
            Se crea activa por defecto. No se puede superar el limite de {MAX_ACTIVE_CURRENCIES} monedas
            activas simultaneas.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleCreate}>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency-code">Codigo (ISO 4217)</Label>
              <Input
                id="currency-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="GBP"
                maxLength={3}
                minLength={3}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency-name">Nombre</Label>
              <Input
                id="currency-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Libra esterlina"
                maxLength={64}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency-symbol">Simbolo</Label>
              <Input
                id="currency-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="£"
                maxLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currency-decimals">Decimales</Label>
              <Input
                id="currency-decimals"
                type="number"
                value={decimalDigits}
                onChange={(e) => setDecimalDigits(e.target.value)}
                min={0}
                max={4}
                required
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={creating}>
              {creating ? "Creando..." : "Crear moneda"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catalogo</CardTitle>
          <CardDescription>Solo las monedas activas se ofrecen al crear un gasto nuevo.</CardDescription>
        </CardHeader>
        <CardContent>
          {currencies === null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codigo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Simbolo</TableHead>
                  <TableHead>Decimales</TableHead>
                  <TableHead>Activa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currencies.map((currency) => (
                  <TableRow key={currency.code}>
                    <TableCell className="font-mono">{currency.code}</TableCell>
                    <TableCell>{currency.name}</TableCell>
                    <TableCell>{currency.symbol}</TableCell>
                    <TableCell>{currency.decimalDigits}</TableCell>
                    <TableCell>
                      <Switch
                        checked={currency.isActive}
                        onCheckedChange={() => handleToggleActive(currency)}
                        aria-label={`Activar/desactivar ${currency.code}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
