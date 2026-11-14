export type ApiErrorCode = 'network' | 'timeout' | 'aborted' | 'http' | 'invalid-response';

interface ApiErrorOptions {
  status?: number;
  retryable?: boolean;
}

export class ApiError extends Error {
  readonly status?: number;
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(message: string, code: ApiErrorCode, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function getErrorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return '';
  return typeof error.name === 'string' ? error.name : '';
}

export function normalizeTransportError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const name = getErrorName(error);
  if (name === 'AbortError') {
    return new ApiError('La solicitud se canceló.', 'aborted');
  }
  if (name === 'TimeoutError') {
    return new ApiError('La solicitud tardó demasiado. Inténtalo de nuevo.', 'timeout', { retryable: true });
  }

  return new ApiError(
    'No se pudo conectar con LESSO. Comprueba tu conexión e inténtalo de nuevo.',
    'network',
    { retryable: true }
  );
}

export function normalizeResponseReadError(error: unknown, status?: number): ApiError {
  const name = getErrorName(error);
  if (name === 'AbortError' || name === 'TimeoutError') {
    return normalizeTransportError(error);
  }
  if (error instanceof TypeError) {
    return normalizeTransportError(error);
  }
  return new ApiError(
    'El servidor envió una respuesta que no se pudo leer. Inténtalo de nuevo.',
    'invalid-response',
    { status, retryable: true }
  );
}

function getCredentialErrorMessage(endpoint: string): string | undefined {
  if (endpoint.startsWith('/auth/login')) {
    return 'El usuario, la contraseña o el código de verificación no son correctos.';
  }
  if (endpoint.startsWith('/auth/unlock')) {
    return 'La contraseña de acceso no es correcta.';
  }
  if (endpoint.startsWith('/auth/change-password')) {
    return 'No se pudo verificar la contraseña actual.';
  }
  if (endpoint.startsWith('/auth/setup-2fa') || endpoint.startsWith('/auth/verify-2fa')) {
    return 'El código de verificación no es correcto.';
  }
  return undefined;
}

export function createHttpApiError(
  status: number,
  endpoint: string,
  isCoreUserEndpoint: boolean
): ApiError {
  const options = { status, retryable: status >= 500 || status === 408 || status === 429 };

  if (status === 401) {
    const credentialMessage = getCredentialErrorMessage(endpoint);
    if (credentialMessage) return new ApiError(credentialMessage, 'http', options);
    if (isCoreUserEndpoint) {
      return new ApiError('Tu sesión de usuario terminó. Inicia sesión para continuar.', 'http', options);
    }
    if (endpoint.startsWith('/auth/status')) {
      return new ApiError('No se pudo verificar el estado de la bóveda. Inténtalo de nuevo.', 'http', options);
    }
    return new ApiError('La bóveda se bloqueó. Desbloquéala para continuar.', 'http', options);
  }

  if (status === 403) {
    return new ApiError('No tienes permiso para completar esta acción.', 'http', options);
  }
  if (status === 408 || status === 504) {
    return new ApiError('La solicitud tardó demasiado. Inténtalo de nuevo.', 'timeout', options);
  }
  if (status === 429) {
    return new ApiError('Se recibieron demasiadas solicitudes. Espera un momento e inténtalo de nuevo.', 'http', options);
  }
  if (status === 413) {
    return new ApiError('El archivo supera el límite permitido.', 'http', options);
  }
  if (status >= 500) {
    return new ApiError('El servidor no pudo completar la solicitud. Inténtalo de nuevo en unos momentos.', 'http', options);
  }
  if (status === 400 || status === 422) {
    return new ApiError('Revisa los datos ingresados e inténtalo de nuevo.', 'http', options);
  }
  if (status === 409) {
    return new ApiError('La información cambió o ya existe un registro. Actualiza la vista e inténtalo de nuevo.', 'http', options);
  }

  const message = status === 404
    ? 'No se encontró la información solicitada.'
    : 'No se pudo completar la solicitud. Revisa los datos e inténtalo de nuevo.';
  return new ApiError(message, 'http', options);
}
