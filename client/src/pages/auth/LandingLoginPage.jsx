import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import {
  api,
  getTenantSlug,
  setTenantSlug,
  useAuthStore,
} from '../../lib/api'
import { Button, Input, toast } from '../../components/ui'
import { homePathForUser, isAdminRole } from '../../lib/roles'
import {
  ArrowRight,
  Check,
  ImageIcon,
  Sparkles,
  Zap,
  Users,
  Clock,
} from 'lucide-react'

gsap.registerPlugin(useGSAP, ScrollTrigger)

const loginSchema = z.object({
  workspace: z
    .string()
    .min(2, 'Workspace slug required')
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Invalid slug'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

/**
 * Drop screenshots into client/public/landing/ and set paths here.
 * Leave null to keep the labeled placeholder visible.
 */
const LANDING_IMAGES = {
  heroDashboard: '/landing/hero-dashboard.png',
  featureTasks: '/landing/feature-tasks.png',
  featureWorkflows: '/landing/feature-workflows.png',
  featureMessages: '/landing/feature-messages.png',
  featureProgress: '/landing/feature-progress.png',
  featureOverview: '/landing/feature-overview.png',
  howSidebar: '/landing/how-sidebar.png',
  stepSetup: '/landing/step-setup.png',
  stepInvite: '/landing/step-invite.png',
  stepTrack: '/landing/step-track.png',
}

const NAV = [
  { href: '#top', label: 'Home' },
  { href: '#features', label: 'Features' },
  { href: '#why', label: 'Why Choose' },
  { href: '#pricing', label: 'Pricing' },
]

const TRUST = [
  'IPSUM',
  'Legalipsum',
  'StudioForge',
  'BuildCo',
  'Aether Labs',
  'Northline',
]

const FEATURES = [
  {
    key: 'tasks',
    title: 'Smart Task Organization',
    body: 'Lists, boards, and priorities that stay in sync across every project.',
    image: LANDING_IMAGES.featureTasks,
    slot: 'Task list / My Tasks grid',
    className: 'lg:col-span-1 lg:row-span-1',
    tall: false,
  },
  {
    key: 'workflows',
    title: 'Automated Workflows',
    body: 'Assign work, move status, and keep the right people in the loop.',
    image: LANDING_IMAGES.featureWorkflows,
    slot: 'Reports & analytics UI',
    className: 'lg:col-span-1 lg:row-span-1',
    tall: false,
  },
  {
    key: 'messages',
    title: 'File & Comment Management',
    body: 'Drawings, BOQs, and threaded comments live next to the task.',
    image: LANDING_IMAGES.featureMessages,
    slot: 'Activity / comments panel',
    className: 'lg:col-span-1 lg:row-span-2',
    tall: true,
  },
  {
    key: 'progress',
    title: 'Real-Time Progress Tracking',
    body: 'See overdue, today, and done history without leaving Home.',
    image: LANDING_IMAGES.featureProgress,
    slot: 'Progress / status board',
    className: 'lg:col-span-1 lg:row-span-1',
    wide: true,
  },
  {
    key: 'overview',
    title: 'Project Overview',
    body: 'Team avatars, ownership, and delivery health at a glance.',
    image: LANDING_IMAGES.featureOverview,
    slot: 'Project overview + avatars',
    className: 'lg:col-span-1 lg:row-span-1',
    tall: false,
  },
]

const STATS = [
  {
    value: 40,
    suffix: '%',
    label: 'Faster task completion with clear priorities and due dates.',
    icon: Zap,
  },
  {
    value: 3,
    suffix: 'x',
    label: 'More visibility across desk, site, and client stakeholders.',
    icon: Sparkles,
  },
  {
    value: 100,
    suffix: '%',
    label: 'Private company workspace — your data stays with you.',
    icon: Users,
  },
  {
    value: 10,
    suffix: 'k+',
    label: 'Hours saved by consolidating chat, files, and planning.',
    icon: Clock,
  },
]

const STEPS = [
  {
    n: '01',
    title: 'Simple And Fast Setup',
    body: 'Create your workspace, invite the team, and import active projects in minutes.',
    image: LANDING_IMAGES.stepInvite,
    slot: 'Setup / onboarding UI',
  },
  {
    n: '02',
    title: 'Organize Your Work',
    body: 'Structure spaces, lists, and boards the way your studio already delivers.',
    image: LANDING_IMAGES.stepSetup,
    slot: 'Spaces / board UI',
  },
  {
    n: '03',
    title: 'Track And Deliver',
    body: 'Home, planner, Gantt, and site modules keep every milestone moving.',
    image: LANDING_IMAGES.stepTrack,
    slot: 'Tracking / planner UI',
  },
]

const PLANS = [
  {
    name: 'Studio',
    price: 'Free',
    hint: 'For small teams getting started',
    features: ['Up to 5 members', 'Projects & tasks', 'Basic channels'],
    cta: 'Get started',
    featured: false,
  },
  {
    name: 'Growth',
    price: 'Custom',
    hint: 'For studios shipping multiple jobs',
    features: [
      'Unlimited members',
      'Gantt, planner & BOQ',
      'Site & client portal',
      'Priority support',
    ],
    cta: 'Contact us',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Talk',
    hint: 'Private deploy & admin controls',
    features: ['SSO-ready', 'Platform admin', 'Custom modules', 'SLA'],
    cta: 'Contact us',
    featured: false,
  },
]

const FLOAT_TAGS = [
  { label: 'Analyst', className: 'lp-float-tag lp-float-a left-[4%] top-[18%]' },
  {
    label: 'Programmer',
    className: 'lp-float-tag lp-float-b right-[2%] top-[28%]',
  },
  {
    label: 'Task Developer',
    className: 'lp-float-tag lp-float-c left-[8%] bottom-[12%]',
  },
]

function ImageSlot({ src, label, className = '', imgClassName = '' }) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={`h-full w-full object-top ${imgClassName || 'object-cover'} ${className}`}
        loading="lazy"
      />
    )
  }
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-[#2e2e32] bg-[#161618] px-4 text-center ${className}`}
    >
      <ImageIcon className="h-7 w-7 text-accent" strokeWidth={1.5} />
      <p className="text-[12px] font-semibold text-[#c5c5c8]">{label}</p>
      <p className="max-w-[200px] text-[10px] leading-relaxed text-[#6b6b70]">
        Drop screenshot in <code className="text-[9px] text-accent/80">/public/landing</code>
      </p>
    </div>
  )
}

function LogoMark({ size = 'md' }) {
  const box = size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-8 w-8 text-[12px]'
  return (
    <span
      className={`flex ${box} items-center justify-center rounded-[6px] bg-[var(--accent)] font-bold text-[#171717] shadow-[0_1px_3px_rgba(0,0,0,0.06)]`}
    >
      E
    </span>
  )
}

const DEMO_CREDENTIALS = {
  staff: {
    workspace: 'cubic',
    email: 'employee@cubic.demo',
    password: 'Employee@Demo123',
  },
  admin: {
    workspace: 'cubic',
    email: 'admin@cubic.demo',
    password: 'Company@Admin123',
  },
}

export function LoginPage() {
  const root = useRef(null)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const portal =
    searchParams.get('portal') === 'admin' ? 'admin' : 'staff'
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      ...DEMO_CREDENTIALS[portal],
      workspace: getTenantSlug() || DEMO_CREDENTIALS[portal].workspace,
    },
  })

  const setPortal = (next) => {
    reset({
      ...DEMO_CREDENTIALS[next],
      workspace: getTenantSlug() || DEMO_CREDENTIALS[next].workspace,
    })
    const p = new URLSearchParams(searchParams)
    if (next === 'admin') p.set('portal', 'admin')
    else p.delete('portal')
    setSearchParams(p, { replace: true })
  }

  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) return

      // Soft premium motion — opacity + transform only (no layout jank)
      const ease = 'power2.out'
      gsap.config({ force3D: true })

      const tl = gsap.timeline({ defaults: { ease, force3D: true } })
      tl.from('.lp-nav > div', {
        y: -18,
        opacity: 0,
        duration: 0.7,
      })
        .from(
          '.lp-hero-copy > *',
          { y: 20, opacity: 0, stagger: 0.09, duration: 0.7 },
          '-=0.35',
        )
        .from(
          '.lp-hero-visual',
          { y: 28, opacity: 0, duration: 0.85 },
          '-=0.4',
        )
        .from(
          '.lp-float-tag',
          { opacity: 0, y: 10, stagger: 0.1, duration: 0.5 },
          '-=0.45',
        )

      // Gentle floating tags (small amplitude = no distraction)
      gsap.to('.lp-float-a', {
        y: -6,
        duration: 3.2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      })
      gsap.to('.lp-float-b', {
        y: 5,
        duration: 3.6,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: 0.4,
      })
      gsap.to('.lp-float-c', {
        y: -4,
        duration: 3,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
        delay: 0.8,
      })

      const reveal = (targets, vars, trigger, start = 'top 86%') => {
        const els = gsap.utils.toArray(targets)
        if (!els.length) return
        gsap.set(els, { opacity: 0, ...vars.from })
        gsap.to(els, {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          duration: vars.duration ?? 0.7,
          ease,
          stagger: vars.stagger ?? 0,
          force3D: true,
          overwrite: 'auto',
          scrollTrigger: {
            trigger,
            start,
            once: true,
            toggleActions: 'play none none none',
          },
        })
      }

      // Section-by-section — short travels, soft staggers
      reveal('.lp-trust-head', { from: { y: 14 }, duration: 0.55 }, '.lp-trust', 'top 92%')
      reveal(
        '.lp-trust-logo',
        { from: { y: 10 }, stagger: 0.04, duration: 0.5 },
        '.lp-trust',
        'top 90%',
      )

      reveal(
        '.lp-feat-head > *',
        { from: { y: 16 }, stagger: 0.08, duration: 0.65 },
        '.lp-features',
        'top 84%',
      )
      reveal(
        '.lp-feat-card',
        { from: { y: 22 }, stagger: 0.08, duration: 0.65 },
        '.lp-feat-grid',
        'top 88%',
      )

      reveal(
        '.lp-why-head > *',
        { from: { y: 16 }, stagger: 0.08, duration: 0.65 },
        '.lp-why',
        'top 84%',
      )
      reveal(
        '.lp-stat-card',
        { from: { y: 18 }, stagger: 0.07, duration: 0.6 },
        '.lp-stat-grid',
        'top 88%',
      )

      reveal(
        '.lp-how-head > *',
        { from: { y: 16 }, stagger: 0.08, duration: 0.65 },
        '.lp-how',
        'top 84%',
      )
      reveal(
        '.lp-how-visual',
        { from: { y: 20 }, duration: 0.75 },
        '.lp-how',
        'top 80%',
      )
      reveal(
        '.lp-step-card',
        { from: { y: 18 }, stagger: 0.1, duration: 0.65 },
        '.lp-steps',
        'top 82%',
      )

      reveal(
        '.lp-price-head > *',
        { from: { y: 16 }, stagger: 0.08, duration: 0.65 },
        '.lp-pricing',
        'top 84%',
      )
      reveal(
        '.lp-price-card',
        { from: { y: 20 }, stagger: 0.09, duration: 0.65 },
        '.lp-price-grid',
        'top 88%',
      )

      reveal(
        '.lp-enter-left',
        { from: { y: 18 }, duration: 0.7 },
        '#enter',
        'top 82%',
      )
      reveal(
        '.lp-enter-right',
        { from: { y: 18 }, duration: 0.7 },
        '#enter',
        'top 82%',
      )

      // Stat counters — smooth, not snappy
      document.querySelectorAll('.lp-stat-value').forEach((el) => {
        const end = Number(el.dataset.value || 0)
        const suffix = el.dataset.suffix || ''
        const obj = { n: 0 }
        ScrollTrigger.create({
          trigger: el,
          start: 'top 90%',
          once: true,
          onEnter: () => {
            gsap.to(obj, {
              n: end,
              duration: 1.6,
              ease: 'power1.out',
              onUpdate: () => {
                el.textContent = `${Math.round(obj.n)}${suffix}`
              },
            })
          },
        })
      })

      // Trust marquee — constant soft drift
      gsap.to('.lp-trust-track', {
        xPercent: -35,
        duration: 36,
        ease: 'none',
        repeat: -1,
      })

      // Recalc after images settle (prevents jump/stutter)
      const refresh = () => ScrollTrigger.refresh()
      requestAnimationFrame(refresh)
      window.addEventListener('load', refresh, { once: true })
      const imgs = gsap.utils.toArray('.lp-root img')
      imgs.forEach((img) => {
        if (!img.complete) img.addEventListener('load', refresh, { once: true })
      })
    },
    { scope: root },
  )

  const onSubmit = async (values) => {
    setLoading(true)
    try {
      setTenantSlug(values.workspace)
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: values.email,
          password: values.password,
        }),
      })

      if (portal === 'admin' && !isAdminRole(data.user) && !data.user.isPlatformAdmin) {
        toast('This account is not Admin / HR. Use Staff sign-in.', {
          type: 'error',
        })
        return
      }

      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        tenant: data.tenant || null,
      })
      toast(
        portal === 'admin' ? 'Welcome to Admin' : 'Welcome back',
        { type: 'success' },
      )
      const dest = homePathForUser(data.user, portal === 'admin' ? 'admin' : 'staff')
      navigate(dest || '/projects')
    } catch (err) {
      toast(err.message || 'Login failed', { type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      ref={root}
      className="lp-root min-h-screen overflow-x-hidden bg-white text-[#171717]"
      style={{ fontFamily: 'var(--font-landing)' }}
    >
      {/* ── FLOATING GLASSY NAV ── */}
      <header className="lp-nav pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4 md:px-6">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-2xl border border-[#dfdfdf] bg-[rgba(255,255,255,0.82)] px-3 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:gap-4 sm:px-5 sm:py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[16px] font-medium tracking-tight text-[#1e2022]">
              Clyro
            </span>
          </a>
          <nav className="hidden items-center gap-5 text-[13px] font-medium text-[#707070] md:flex lg:gap-7">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition-colors hover:text-[var(--accent)]"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href="#enter"
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-[#171717] shadow-[0_6px_16px_rgba(37,99,235,0.28)] transition hover:bg-[var(--accent-hover)] sm:px-5 sm:text-[13px]"
          >
            Contact Us
          </a>
        </div>
      </header>

      {/* ── HERO ── */}
      <section
        id="top"
        className="lp-hero relative overflow-hidden bg-white pb-16 pt-28 text-[#171717] md:pb-24 md:pt-32"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,_rgba(37,99,235,0.10)_0%,_transparent_58%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_35%,_rgba(14,165,233,0.08)_0%,_transparent_45%)]" />

        <div className="relative z-10 mx-auto max-w-5xl px-4 text-center md:px-6">
          <div className="lp-hero-copy mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#e5dfd7] bg-[#faf9f7] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#68645e]">
              Studio operations
            </span>
            <h1 className="mt-5 text-[clamp(2.35rem,6vw,3.85rem)] font-medium leading-[1.08] tracking-[-0.03em] text-[#1e2022]">
              Clyro
              <br />
              <span className="text-[0.55em] font-normal tracking-[0.08em] text-[#68645e]">
                Interior architecture OS
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#68645e] md:text-[16px]">
              Enquiries, drawings, quotations, materials, site, and billing for
              the studio — one workspace from first brief to handover.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#enter"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-[14px] font-semibold text-[#171717] shadow-[0_12px_28px_rgba(37,99,235,0.3)] transition hover:bg-[var(--accent-hover)]"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#features"
                className="rounded-full border border-[#c7c7c7] bg-[rgba(255,255,255,0.9)] px-7 py-3.5 text-[14px] font-semibold text-[#171717] shadow-[0_6px_18px_rgba(15,23,42,0.06)] backdrop-blur transition hover:border-[#4ade80] hover:text-[var(--accent-hover)]"
              >
                Book a Demo
              </a>
            </div>
          </div>

          <div className="lp-hero-visual relative mx-auto mt-12 max-w-[980px] md:mt-16">
            {FLOAT_TAGS.map((tag) => (
              <span
                key={tag.label}
                className={`absolute z-20 hidden rounded-full border border-[#dfdfdf] bg-[rgba(255,255,255,0.95)] px-3.5 py-1.5 text-[11px] font-semibold text-[#334155] shadow-[0_8px_20px_rgba(15,23,42,0.12)] backdrop-blur sm:inline-flex ${tag.className}`}
              >
                {tag.label}
              </span>
            ))}
            <div className="lp-glow-frame lp-glow-frame--hero">
              <div className="lp-glow-inner">
                <div className="aspect-[16/9] w-full sm:aspect-[2/1]">
                  <ImageSlot
                    src={LANDING_IMAGES.heroDashboard}
                    label="Main dashboard screenshot"
                    imgClassName="rounded-[19px] object-cover object-top"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ── */}
      <section className="lp-trust border-y border-[#2e2e32] bg-white px-4 py-10 md:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="lp-trust-head max-w-xs text-[13px] font-semibold leading-snug text-[#171717] md:text-[14px]">
            Endorsed by the globe&apos;s leading innovative enterprises.
          </p>
          <div className="mt-6 overflow-hidden">
            <div className="lp-trust-track flex w-max gap-3">
              {[...TRUST, ...TRUST].map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="lp-trust-logo inline-flex h-11 items-center rounded-full border border-[#2e2e32] bg-[#1c1c1e] px-6 text-[12px] font-bold tracking-wide text-[#6b6b70]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section
        id="features"
        className="lp-features bg-[#121214] px-4 py-16 md:px-6 md:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <div className="lp-feat-head mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.65rem)] font-bold tracking-tight text-[#171717]">
              Unlock Premium Benefits That Elevate Your Efficiency.
            </h2>
            <p className="mt-3 text-[15px] text-[#8b8b90]">
              Everything your studio needs to plan, track, and deliver — without
              the tool pile.
            </p>
          </div>

          <div className="lp-feat-grid mt-12 grid auto-rows-[minmax(220px,auto)] gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2">
            {FEATURES.map((f) => (
              <article
                key={f.key}
                className={`lp-feat-card group flex flex-col overflow-hidden rounded-[22px] ${f.className} ${
                  f.tall ? 'min-h-[460px]' : ''
                }`}
              >
                <div className="lp-glow-frame lp-glow-frame--card flex h-full flex-col">
                  <div className="lp-glow-inner flex h-full flex-col">
                    <div className="px-5 pt-5">
                      <h3 className="text-[16px] font-bold tracking-tight text-[#171717]">
                        {f.title}
                      </h3>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-[#8b8b90]">
                        {f.body}
                      </p>
                    </div>
                    <div
                      className={`mt-4 min-h-0 flex-1 overflow-hidden px-4 pb-4 ${
                        f.tall ? 'min-h-[320px]' : 'min-h-[140px]'
                      }`}
                    >
                      <div className="h-full overflow-hidden rounded-2xl border border-[#2e2e32] bg-white">
                        <ImageSlot
                          src={f.image}
                          label={f.slot}
                          imgClassName={
                            f.key === 'messages'
                              ? 'object-contain object-top bg-white'
                              : 'object-cover'
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY / STATS ── */}
      <section id="why" className="lp-why bg-white px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="lp-why-head mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.65rem)] font-bold tracking-tight text-[#171717]">
              Why Teams Choose EPM
            </h2>
            <p className="mt-3 text-[15px] text-[#8b8b90]">
              Built for interior delivery — from lead to handover — with the
              clarity of modern task platforms.
            </p>
          </div>

          <div className="lp-stat-grid mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => {
              const Icon = s.icon
              return (
                <article
                  key={s.label}
                  className="lp-stat-card relative rounded-[20px] border border-[#2e2e32] bg-[#1c1c1e] p-6"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className="lp-stat-value text-[clamp(2rem,4vw,2.75rem)] font-bold tracking-tight text-[#171717]"
                      data-value={s.value}
                      data-suffix={s.suffix}
                    >
                      0{s.suffix}
                    </p>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
                      <Icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-6 text-[13px] leading-relaxed text-[#8b8b90]">
                    {s.label}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="lp-how bg-[#121214] px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="lp-how-head mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.65rem)] font-bold tracking-tight text-[#171717]">
              Get Started In Just 3 Easy Steps
            </h2>
            <p className="mt-3 text-[15px] text-[#8b8b90]">
              From empty workspace to live delivery — without a painful rollout.
            </p>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
            <div className="lp-how-visual lp-glow-frame relative h-full min-h-[280px] sm:min-h-[320px] lg:min-h-0">
              <div className="lp-glow-inner absolute inset-[1px] h-[calc(100%-2px)]">
                <ImageSlot
                  src={LANDING_IMAGES.howSidebar}
                  label="Sidebar + task board screenshot"
                  className="absolute inset-0 h-full w-full"
                  imgClassName="object-cover object-top"
                />
              </div>
            </div>

            <div className="lp-steps flex h-full flex-col gap-4">
              {STEPS.map((step) => (
                <article
                  key={step.n}
                  className="lp-step-card relative flex-1 overflow-hidden rounded-[20px]"
                >
                  <div className="lp-glow-frame h-full">
                    <div className="lp-glow-inner p-5 md:p-6">
                      <div className="relative z-10 flex gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-[#0E0E10]">
                          {step.n}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[16px] font-bold text-[#171717]">
                            {step.title}
                          </h3>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-[#8b8b90]">
                            {step.body}
                          </p>
                        </div>
                      </div>
                      <div className="relative z-10 mt-4 h-16 overflow-hidden rounded-xl border border-[#2e2e32] bg-white sm:h-20">
                        <ImageSlot
                          src={step.image}
                          label={step.slot}
                          imgClassName="object-top object-cover"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section
        id="pricing"
        className="lp-pricing bg-[#121214] px-4 py-16 md:px-6 md:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <div className="lp-price-head mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,3.5vw,2.65rem)] font-bold tracking-tight text-[#171717]">
              Simple Plans For Growing Studios
            </h2>
            <p className="mt-3 text-[15px] text-[#8b8b90]">
              Start free, scale when your pipeline needs the full OS.
            </p>
          </div>

          <div className="lp-price-grid mt-12 grid gap-5 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`lp-price-card flex flex-col rounded-[12px] border p-6 md:p-8 ${
                  plan.featured
                    ? 'on-dark border-transparent bg-[#1c1c1c] text-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]'
                    : 'border-[#dfdfdf] bg-white'
                }`}
              >
                <p
                  className={`text-[13px] font-medium ${
                    plan.featured ? 'text-[#4ade80]' : 'text-[#707070]'
                  }`}
                >
                  {plan.name}
                </p>
                <p className={`mt-2 text-[2rem] font-medium tracking-tight ${plan.featured ? 'text-white' : 'text-[#171717]'}`}>
                  {plan.price}
                </p>
                <p className={`mt-1 text-[13px] ${plan.featured ? 'text-[#9a9a9a]' : 'text-[#707070]'}`}>{plan.hint}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${plan.featured ? 'text-[var(--accent)]' : 'text-accent'}`} />
                      <span className={plan.featured ? 'text-[#dfdfdf]' : 'text-[#212121]'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#enter"
                  className={`mt-7 inline-flex items-center justify-center rounded-[6px] px-5 py-3 text-[14px] font-medium transition ${
                    plan.featured
                      ? 'bg-accent text-[#171717] hover:bg-accent-hover'
                      : 'border border-[#c7c7c7] bg-white text-[#171717] hover:bg-[#fafafa]'
                  }`}
                >
                  {plan.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── SIGN IN ── */}
      <section id="enter" className="bg-white px-4 py-16 md:px-6 md:py-20">
        <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[12px] border border-[#dfdfdf] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] md:grid-cols-2">
          <div className="lp-enter-left on-dark relative overflow-hidden bg-[#1c1c1c] px-7 py-10 text-white md:px-10 md:py-12">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15" />
            <div className="pointer-events-none absolute -bottom-16 -left-8 h-48 w-48 rounded-full bg-white/5" />
            <div className="relative z-10">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                Enter
              </p>
              <h2 className="mt-3 text-[clamp(1.5rem,3vw,2.1rem)] font-medium leading-tight tracking-tight">
                {portal === 'admin'
                  ? 'Company admin sign-in'
                  : 'Staff sign-in'}
              </h2>
              <p className="mt-4 text-[14px] leading-relaxed text-[#9a9a9a]">
                {portal === 'admin'
                  ? 'People, company operations, permissions, and workspace administration.'
                  : 'Projects, tasks, and site work — for your studio team.'}
              </p>
              <p className="mt-8 text-[11px] text-[#707070]">
                {portal === 'admin'
                  ? 'Demo admin · cubic · admin@cubic.demo · Company@Admin123'
                  : 'Demo employee · cubic · employee@cubic.demo · Employee@Demo123'}
              </p>
            </div>
          </div>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="lp-enter-right space-y-3.5 px-7 py-10 md:px-10 md:py-12"
          >
            <div className="flex rounded-[6px] border border-[#dfdfdf] bg-[#fafafa] p-1">
              <button
                type="button"
                onClick={() => setPortal('staff')}
                className={`flex-1 rounded-[6px] py-2 text-[12px] font-medium transition ${
                  portal === 'staff'
                    ? 'bg-[#1e2022] text-white'
                    : 'text-[#707070] hover:text-[#171717]'
                }`}
              >
                Staff
              </button>
              <button
                type="button"
                onClick={() => setPortal('admin')}
                className={`flex-1 rounded-[6px] py-2 text-[12px] font-medium transition ${
                  portal === 'admin'
                    ? 'bg-[#1e2022] text-white'
                    : 'text-[#707070] hover:text-[#171717]'
                }`}
              >
                Admin / Owner
              </button>
            </div>
            <Input
              label="Workspace"
              placeholder="your-company"
              autoComplete="organization"
              error={errors.workspace?.message}
              {...register('workspace')}
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-[12px] text-[#6b6b70] hover:text-accent"
              >
                Forgot password?
              </Link>
            </div>
            <Button
              type="submit"
              loading={loading}
              size="lg"
              className="w-full !rounded-[4px] !bg-[#1e2022] !text-white hover:!bg-[#33373b]"
            >
              Enter studio
            </Button>
          </form>
        </div>
      </section>

      <footer className="border-t border-[#2e2e32] bg-white px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <LogoMark size="sm" />
            <span className="text-[13px] font-bold text-[#171717]">EPM</span>
          </div>
          <p className="text-[12px] text-[#6b6b70]">by Editco</p>
        </div>
      </footer>
    </div>
  )
}
