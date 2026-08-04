import { AppError } from "@/lib/errors";
import type { SplitwiseOAuthConfig } from "./config";

/**
 * Cliente HTTP de la API de Splitwise v3 (Fase 11). URLs y rutas
 * verificadas contra la documentacion oficial (`https://dev.splitwise.com/`)
 * y el SDK oficial en Python (`OAUTH_BASE_URL`/endpoints de
 * `get_current_user`/`get_groups`/`get_group/{id}`/`get_expenses`), no
 * inventadas.
 */
export const SPLITWISE_OAUTH_AUTHORIZE_URL = "https://www.splitwise.com/oauth/authorize";
export const SPLITWISE_OAUTH_TOKEN_URL = "https://www.splitwise.com/oauth/token";
export const SPLITWISE_API_BASE_URL = "https://secure.splitwise.com/api/v3.0";

export interface SplitwiseUser {
  id: number;
  first_name: string | null;
  last_name: string | null;
}

export interface SplitwiseCurrentUserResponse {
  user: SplitwiseUser;
}

export interface SplitwiseGroup {
  id: number;
  name: string;
  members: SplitwiseUser[];
}

export interface SplitwiseGroupsResponse {
  groups: SplitwiseGroup[];
}

export interface SplitwiseExpenseUserShare {
  user_id: number;
  paid_share: string;
  owed_share: string;
}

export interface SplitwiseExpense {
  id: number;
  group_id: number | null;
  description: string;
  details: string | null;
  cost: string;
  currency_code: string;
  date: string;
  payment: boolean;
  deleted_at: string | null;
  created_by: SplitwiseUser | null;
  users: SplitwiseExpenseUserShare[];
}

export interface SplitwiseExpensesResponse {
  expenses: SplitwiseExpense[];
}

export interface SplitwiseTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Error tipado de la API de Splitwise, distingue si conviene reintentar
 * (429/5xx/red) de errores que requieren intervencion (401/403/404): ver
 * backlog Fase 11, "Tratar 401, 403, 404, 429 y 5xx con reautenticacion
 * cuando corresponda, backoff exponencial, jitter y reintentos acotados".
 */
export class SplitwiseApiError extends AppError {
  readonly retryable: boolean;
  readonly needsReauth: boolean;

  constructor(status: number, message: string) {
    super(502, message, "splitwise_api_error");
    this.retryable = status === 429 || status >= 500;
    this.needsReauth = status === 401 || status === 403;
  }
}

export function buildSplitwiseAuthorizeUrl(config: SplitwiseOAuthConfig, state: string, redirectUri: string): string {
  const url = new URL(SPLITWISE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSplitwiseCodeForToken(
  config: SplitwiseOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<SplitwiseTokenResponse> {
  const response = await fetch(SPLITWISE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  if (!response.ok) {
    throw new SplitwiseApiError(response.status, "No se pudo intercambiar el codigo de autorizacion de Splitwise");
  }
  return response.json();
}

async function splitwiseFetch<T>(accessToken: string, path: string, searchParams?: Record<string, string>): Promise<T> {
  const url = new URL(`${SPLITWISE_API_BASE_URL}/${path}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new SplitwiseApiError(response.status, `Splitwise respondio ${response.status} al consultar "${path}"`);
  }
  return response.json();
}

export interface GetExpensesParams {
  groupId: string;
  limit?: number;
  offset?: number;
  updatedAfter?: string;
}

const DEFAULT_EXPENSES_PAGE_LIMIT = 20;

export class SplitwiseClient {
  constructor(private readonly accessToken: string) {}

  getCurrentUser(): Promise<SplitwiseCurrentUserResponse> {
    return splitwiseFetch<SplitwiseCurrentUserResponse>(this.accessToken, "get_current_user");
  }

  getGroups(): Promise<SplitwiseGroupsResponse> {
    return splitwiseFetch<SplitwiseGroupsResponse>(this.accessToken, "get_groups");
  }

  getGroup(groupId: string): Promise<{ group: SplitwiseGroup }> {
    return splitwiseFetch<{ group: SplitwiseGroup }>(this.accessToken, `get_group/${groupId}`);
  }

  /** Pagina `get_expenses` (limit/offset, default 20 por defecto en la API real). Incluye borrados (`deleted_at`): el servicio decide como tratarlos. */
  getExpenses(params: GetExpensesParams): Promise<SplitwiseExpensesResponse> {
    return splitwiseFetch<SplitwiseExpensesResponse>(this.accessToken, "get_expenses", {
      group_id: params.groupId,
      limit: String(params.limit ?? DEFAULT_EXPENSES_PAGE_LIMIT),
      offset: String(params.offset ?? 0),
      ...(params.updatedAfter ? { updated_after: params.updatedAfter } : {}),
    });
  }
}
