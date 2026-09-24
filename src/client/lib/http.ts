export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && !['/auth/login', '/auth/register'].includes(url)) {
      window.dispatchEvent(new Event('auth:unauthenticated'));
    }
    throw new ApiError(response.status, body.error ?? 'request_failed');
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_password': return 'Incorrect password. Your account has not been deleted.';
      case 'invalid_deletion_request': return 'Enter your current password to confirm deletion.';
      case 'invalid_credentials': return 'Incorrect email or password.';
      case 'email_taken': return 'An account already exists for this email.';
      case 'invalid_request': return 'Check your email and password. New passwords must contain 12–128 characters.';
      case 'invalid_task': return 'Check the task name, date, and priority.';
      case 'task_unavailable': return 'This task is no longer available to claim. The list has been refreshed.';
      case 'task_not_found': return 'This task is no longer available.';
      case 'unauthenticated': return 'Your session has expired. Please sign in again.';
      case 'auth_unavailable': return 'Sign-in is temporarily unavailable. Please try again later.';
    }
  }
  return 'The request failed. Please try again.';
}
