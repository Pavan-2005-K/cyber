import axios from 'axios'
import { api } from './api'

export interface RegisterUserRequest {
  username: string
  email: string
  password: string
}

export interface RegisteredUser {
  id: number
  username: string
  email: string
  role: string
}

export interface RegisterUserResponse {
  message: string
  user: RegisteredUser
}

export interface LoginUserRequest {
  username_or_email: string
  password: string
}

export interface LoginUserResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface CurrentUserResponse {
  id: number
  username: string
  email: string
  role: string
  is_active: boolean
}

function getValidationErrorMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null

  const messages = detail.flatMap((item: unknown) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('msg' in item) ||
      typeof item.msg !== 'string'
    ) {
      return []
    }

    const field =
      'loc' in item && Array.isArray(item.loc)
        ? item.loc.find((part): part is string => typeof part === 'string')
        : undefined
    const fieldName =
      field === 'username'
        ? 'Username'
        : field === 'email'
          ? 'Email'
          : field === 'password'
            ? 'Password'
            : null
    const message = item.msg.replace(/^Value error,\s*/i, '')

    if (/at least 3 characters/i.test(message) && fieldName === 'Username') {
      return ['Username must contain at least 3 characters.']
    }
    if (/at most 50 characters/i.test(message) && fieldName === 'Username') {
      return ['Username cannot exceed 50 characters.']
    }
    if (/at least 12 characters/i.test(message) && fieldName === 'Password') {
      return ['Password must contain at least 12 characters.']
    }
    if (/at most 128 characters/i.test(message) && fieldName === 'Password') {
      return ['Password cannot exceed 128 characters.']
    }
    if (/pattern/i.test(message) && fieldName === 'Username') {
      return ['Username can contain only letters, numbers, periods, underscores, and hyphens.']
    }

    return [fieldName ? `${fieldName}: ${message}` : message]
  })

  return messages.length ? messages.join(' ') : null
}

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return error.message
  }

  if (!axios.isAxiosError(error)) return fallback

  switch (error.response?.status) {
    case 401:
      return 'Invalid username/email or password.'
    case 409:
      return 'That username or email is already registered.'
    case 422:
      return (
        getValidationErrorMessage(error.response.data?.detail) ??
        'Please check your information and try again.'
      )
    case 429:
      return 'Too many attempts. Please wait a moment before trying again.'
    default:
      if (
        typeof error.response?.data === 'object' &&
        error.response.data !== null &&
        'detail' in error.response.data &&
        typeof error.response.data.detail === 'string'
      ) {
        return error.response.data.detail
      }
      return fallback
  }
}

export async function registerUser(
  data: RegisterUserRequest,
): Promise<RegisterUserResponse> {
  const response = await api.post<RegisterUserResponse>(
    '/api/auth/register',
    data,
  )

  return response.data
}

export async function loginUser(
  data: LoginUserRequest,
): Promise<LoginUserResponse> {
  const response = await api.post<LoginUserResponse>('/api/auth/login', data)

  return response.data
}

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const response = await api.get<CurrentUserResponse>('/api/auth/me')

  return response.data
}

export async function logoutUser(token: string): Promise<void> {
  await api.post(
    '/api/auth/logout',
    null,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )
}
