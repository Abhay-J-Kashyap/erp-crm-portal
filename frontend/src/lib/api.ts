import axios, { AxiosError } from "axios";
import type { ApiError, ApiResponse } from "./types";

/**
 * ONE HTTP CLIENT FOR THE WHOLE APP.
 * Configured once here so no component ever thinks about base URLs,
 * headers, or token plumbing.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api",
  headers: { "Content-Type": "application/json" },
  timeout: 20000,
});

const TOKEN_KEY = "erp_token";

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * REQUEST INTERCEPTOR — runs before every outgoing request.
 * Attaches the token so no component ever sets an Authorization header.
 * Reading from localStorage each time (rather than caching in a module
 * variable) means a login in another tab is picked up automatically.
 */
api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * RESPONSE INTERCEPTOR — runs on every response.
 *
 * A 401 means the token is missing, invalid, or expired. Rather than
 * making every component handle that, we clear the token and bounce to
 * login in ONE place.
 *
 * The pathname guard prevents a redirect loop: a failed login attempt
 * also returns 401, and redirecting to /login from /login would wipe
 * the error message before the user could read it.
 */
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      tokenStorage.clear();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

/**
 * Turns any axios failure into a readable message.
 *
 * Prefers the field-level errors our Zod middleware returns, so a form
 * shows "Mobile must be a 10-digit Indian number" rather than
 * "Request failed with status code 400".
 */
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;

    if (Array.isArray(data?.errors) && data.errors.length > 0) {
      return data.errors.map((e) => e.message).join(". ");
    }
    if (data?.message) return data.message;

    // No response at all means the request never reached the server.
    if (!error.response) return "Cannot reach the server. Is the backend running?";

    return error.message;
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong";
};

/** Field-level errors, for mapping onto form inputs. */
export const getFieldErrors = (error: unknown): Record<string, string> => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (Array.isArray(data?.errors)) {
      return Object.fromEntries(data.errors.map((e) => [e.field, e.message]));
    }
  }
  return {};
};

/**
 * Thin wrappers that unwrap the `data` property, so callers write
 *   const customers = await get<Customer[]>("/customers")
 * instead of reaching through response.data.data every time.
 */
export const unwrap = async <T>(promise: Promise<{ data: ApiResponse<T> }>): Promise<T> => {
  const response = await promise;
  return response.data.data;
};

/** Keeps pagination meta alongside the rows. */
export const unwrapWithMeta = async <T>(
  promise: Promise<{ data: ApiResponse<T> }>
): Promise<{ data: T; meta?: ApiResponse<T>["meta"] }> => {
  const response = await promise;
  return { data: response.data.data, meta: response.data.meta };
};
