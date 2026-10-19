import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { api, setTenantSlug, useAuthStore } from '../../lib/api'
import { Button, Input, toast } from '../../components/ui'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export function PlatformLoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values) => {
    setLoading(true)
    try {
      setTenantSlug('cubic')
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      })

      if (!data.user?.isPlatformAdmin) {
        toast('This account is not a platform administrator.', { type: 'error' })
        return
      }

      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenant: data.tenant || null,
      })
      navigate('/platform', { replace: true })
    } catch (err) {
      toast(err.message, { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-surface-raised px-5 py-16 text-primary"
      style={{ fontFamily: 'var(--font-landing)' }}
    >
      <div className="w-full max-w-md rounded-[12px] border border-border bg-surface p-8 shadow-[0_8px_24px_rgba(0,0,0,0.08)] md:p-10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[var(--accent)] text-[14px] font-bold text-[#171717]">
            E
          </span>
          <div>
            <p className="text-[16px] font-semibold text-primary">Editco Platform</p>
            <p className="text-[12px] text-secondary">Administrator sign-in</p>
          </div>
        </div>

        <h1 className="text-[22px] font-bold tracking-tight text-primary">
          Platform admin
        </h1>
        <p className="mt-2 mb-6 text-[13px] leading-relaxed text-secondary">
          Manage workspaces and provision login credentials for companies like Cubic.
          This portal is separate from company workspaces.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            light
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            light
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" className="w-full" loading={loading} size="lg">
            Sign in to platform
          </Button>
        </form>

        <Link
          to="/login"
          className="mt-6 block text-center text-[12px] text-secondary hover:text-[var(--accent)]"
        >
          ← Back to company login
        </Link>
      </div>
    </div>
  )
}
