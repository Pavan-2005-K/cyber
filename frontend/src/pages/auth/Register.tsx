import { useState } from 'react'
import { AtSign, Fingerprint, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthErrorMessage, registerUser } from '../../services/authService'
import AuthPageLayout, {
  AuthTextField,
  PasswordField,
} from './AuthPageLayout'

export default function Register() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')

    const formData = new FormData(event.currentTarget)
    const username = String(formData.get('username') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()

    if (!username || !email || !password || !confirmPassword) {
      setErrorMessage('Complete all fields to create your account.')
      return
    }
    if (password.length < 12) {
      setErrorMessage('Your password must be at least 12 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('The passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await registerUser({ username, email, password })
      navigate('/login', {
        replace: true,
        state: {
          registrationSuccess:
            response.message || 'Account created successfully. Please sign in.',
        },
      })
    } catch (error) {
      setErrorMessage(
        getAuthErrorMessage(error, 'Unable to create your account. Please try again.'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthPageLayout
      eyebrow="Investigator registration"
      title="Create your account"
      description="Set up your credentials to access the CyberFusion workspace."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-blue-400 transition hover:text-blue-300"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
          label="Username"
          placeholder="Choose a username"
          autoComplete="username"
          icon={<UserRound size={17} aria-hidden="true" />}
        />
        <AuthTextField
          id="email"
          label="Email"
          type="email"
          placeholder="you@organization.com"
          autoComplete="email"
          icon={<AtSign size={17} aria-hidden="true" />}
        />
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          visible={showPassword}
          onToggleVisibility={() => setShowPassword((visible) => !visible)}
          minLength={12}
          helperText="Use at least 12 characters."
        />
        <PasswordField
          id="confirm-password"
          label="Confirm Password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          visible={showConfirmPassword}
          onToggleVisibility={() =>
            setShowConfirmPassword((visible) => !visible)
          }
        />
        <p className="flex items-start gap-2 pt-1 text-xs leading-5 text-slate-500">
          <Fingerprint
            size={15}
            className="mt-0.5 shrink-0 text-blue-400"
            aria-hidden="true"
          />
          Public accounts are created with the Investigator role.
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Creating account…' : 'Create Account'}
        </button>
      </form>
    </AuthPageLayout>
  )
}
