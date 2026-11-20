/**
 * Public account-deletion instructions for Google Play / App Store.
 * Must stay reachable without login.
 */
const SUPPORT_EMAIL = 'aanya@cubic.studio'

export function DeleteAccountPage() {
  const subject = encodeURIComponent('Delete my Clyro account')
  const body = encodeURIComponent(
    [
      'Please delete my Clyro account and associated personal data.',
      '',
      'Full name:',
      'Account email:',
      'Studio / workspace name (if known):',
      '',
      'I confirm I want this account permanently deleted.',
    ].join('\n'),
  )
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`

  return (
    <div className="min-h-screen bg-[#faf9f7] px-4 py-12 text-[#1a1c1b]">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-2.5">
          <img
            src="/clyro-logo.png"
            alt="Clyro"
            className="h-8 w-8 rounded-[8px] object-cover"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a573b]">
            Clyro
          </p>
        </div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">
          Delete your account
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#44474a]">
          You can request permanent deletion of your Clyro account and personal
          data associated with it. This page is provided for Play Store and App
          Store account-deletion requirements.
        </p>

        <ol className="mt-8 list-decimal space-y-3 pl-5 text-[14px] leading-relaxed text-[#1a1c1b]">
          <li>
            Email us from the same address you use to sign in, or include that
            email clearly in your message.
          </li>
          <li>
            Send the request to{' '}
            <a className="font-semibold text-[#7a573b] underline" href={mailto}>
              {SUPPORT_EMAIL}
            </a>
            .
          </li>
          <li>
            We will verify ownership, delete the account, and remove or anonymize
            personal data within <strong>30 days</strong>, unless we must keep
            limited records for legal or accounting reasons.
          </li>
        </ol>

        <div className="mt-8 rounded-2xl border border-[#e5dfd7] bg-white p-5">
          <p className="text-[13px] font-semibold">What gets deleted</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#44474a]">
            Your login, profile (name, email, phone, photo), messages you sent,
            attendance punches tied to you, and personal preferences.
          </p>
          <p className="mt-3 text-[13px] font-semibold">What may remain</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#44474a]">
            Project records needed by the studio (for example BOQs, purchase
            orders, or site photos shared with the team) may stay with the
            company workspace after your account is removed, with your personal
            identifiers cleared where possible.
          </p>
        </div>

        <a
          href={mailto}
          className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-[#1e2022] px-5 text-[14px] font-semibold text-white hover:bg-black"
        >
          Request account deletion
        </a>

        <p className="mt-6 text-[12px] text-[#8a847c]">
          Already signed in on web? You can also ask your studio admin to remove
          your user from People / Admin, then follow up by email if you also want
          personal data wiped.
        </p>
      </div>
    </div>
  )
}
