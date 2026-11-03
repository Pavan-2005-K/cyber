import { useState } from 'react'
import { AtSign, ArrowRight } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { getAuthErrorMessage } from '../../services/authService'
import AuthPageLayout, {
  AuthTextField,
  PasswordField,
} from './AuthPageLayout'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const registrationSuccess =
    typeof location.state === 'object' &&
    location.state !== null &&
    'registrationSuccess' in location.state &&
    typeof location.state.registrationSuccess === 'string'
      ? location.state.registrationSuccess
      : ''

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    const username_or_email = usernameOrEmail.trim()
    if (!username_or_email || !password) {
      setErrorMessage('Enter your username or email and password.')
      return
    }

    setIsSubmitting(true)
    try {
      await login({ username_or_email, password })
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setErrorMessage(
        getAuthErrorMessage(error, 'Unable to sign in. Please try again.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Welcome back"
      title="Sign in to CyberFusion"
      description="Enter your credentials to continue to your workspace."
      footer={
        <>
          New to CyberFusion?{' '}
          <Link
            to="/register"
            className="font-medium text-blue-400 transition hover:text-blue-300"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {registrationSuccess && (
          <p
            role="status"
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-300"
          >
            {registrationSuccess}
          </p>
        )}
        {errorMessage && (
          <p
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
          >
            {errorMessage}
          </p>
        )}
        <AuthTextField
          id="username"
          label="Username or Email"
          placeholder="Enter your username or email"
          autoComplete="username"
          icon={<AtSign size={17} aria-hidden="true" />}
          value={usernameOrEmail}
          onChange={(event) => setUsernameOrEmail(event.target.value)}
        />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          visible={showPassword}
          onToggleVisibility={() => setShowPassword((visible) => !visible)}
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Signing in…' : 'Login'}
          <ArrowRight
            size={17}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </form>
    </AuthPageLayout>
  )
}
