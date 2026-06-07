// En desarrollo se usa el proxy de vite (/api/v1 → backend local).
// En producción se debe configurar VITE_API_BASE_URL apuntando al backend desplegado.
const API_BASE_URL = (() => {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/$/, '') + '/api/v1';
  return '/api/v1';
})();

/**
 * Construye una URL absoluta hacia el backend.
 * Acepta paths que empiezan con `/api/v1/...` o `/...` (relativo a `/api/v1`).
 */
export function apiUrl(path: string): string {
  if (!path.startsWith('/')) path = '/' + path;
  if (path.startsWith('/api/v1')) {
    return API_BASE_URL + path.replace(/^\/api\/v1/, '');
  }
  return API_BASE_URL + path;
}

interface FetchOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  private getHeaders(options: FetchOptions): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    
    return headers;
  }
  
  async request<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: this.getHeaders(options),
    };
    
    const response = await fetch(url, config);
    
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.detail || errorMessage;
      } catch {
        // No JSON response
      }
      if (response.status === 401 && typeof window !== 'undefined') {
        try {
          localStorage.removeItem('auth-storage');
        } catch {
          // ignore localStorage access issues
        }
        const currentPath = window.location.pathname || '';
        if (!currentPath.startsWith('/login')) {
          window.location.href = '/login';
        }
        errorMessage = 'Sesion expirada o invalida. Inicia sesion de nuevo.';
      }
      const error = new Error(errorMessage) as Error & { response?: { data: { detail: string } } };
      error.response = { data: { detail: errorMessage } };
      throw error;
    }
    
    if (response.status === 204) {
      return undefined as T;
    }
    
    return response.json();
  }
  
  get<T>(endpoint: string, token?: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', token });
  }
  
  post<T>(endpoint: string, data: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    });
  }
  
  put<T>(endpoint: string, data: unknown, token?: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    });
  }
  
  delete<T>(endpoint: string, token?: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', token });
  }
}

export const api = new ApiClient(API_BASE_URL);
