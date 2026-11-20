/**
 * Public privacy policy for Google Play / App Store / web.
 * Must stay reachable without login.
 */
const SUPPORT_EMAIL = 'aanya@cubic.studio'
const APP_NAME = 'Clyro'
const LAST_UPDATED = '20 November 2026'

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] px-4 py-12 text-[#1a1c1b]">
      <article className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2.5">
          <img
            src="/clyro-logo.png"
            alt={APP_NAME}
            className="h-8 w-8 rounded-[8px] object-cover"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a573b]">
            {APP_NAME}
          </p>
        </div>
        <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">
          Privacy Policy
        </h1>
        <p className="mt-2 text-[13px] text-[#8a847c]">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-6 text-[14px] leading-relaxed text-[#44474a]">
          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">1. Who we are</h2>
            <p className="mt-2">
              {APP_NAME} (“we”, “us”) provides a project-management app for interior
              studios — projects, tasks, drawings, site updates, materials, team
              chat, and attendance. This policy explains what personal data we
              collect in the mobile and web apps and how we use it.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">2. Data we collect</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-[#1a1c1b]">Account data:</strong> name,
                email, password (stored hashed), phone, profile photo, role.
              </li>
              <li>
                <strong className="text-[#1a1c1b]">Project work:</strong> project
                details, tasks, notes, BOQs, purchase orders, drawings, and files
                you upload.
              </li>
              <li>
                <strong className="text-[#1a1c1b]">Site content:</strong> photos,
                site updates, and snag reports posted by your team.
              </li>
              <li>
                <strong className="text-[#1a1c1b]">Messages:</strong> team inbox /
                chat content you send.
              </li>
              <li>
                <strong className="text-[#1a1c1b]">Attendance location:</strong>{' '}
                approximate or precise location only when you punch in or out
                (not tracked in the background).
              </li>
              <li>
                <strong className="text-[#1a1c1b]">Device / tech:</strong> basic
                app and network info needed to run the service (for example
                session tokens). We do not sell advertising IDs.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">3. How we use data</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Provide app features and keep you signed in</li>
              <li>Manage your studio account and workspace</li>
              <li>Show project progress, site photos, and team messages</li>
              <li>Record attendance punches with location when you choose to punch</li>
              <li>Send product or security-related notices when needed</li>
              <li>Protect the service (security, abuse prevention, legal compliance)</li>
            </ul>
            <p className="mt-2">
              We do <strong className="text-[#1a1c1b]">not</strong> sell your
              personal data or use it for third-party advertising.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">4. Sharing</h2>
            <p className="mt-2">
              Data stays inside your studio workspace so teammates and admins
              can do their jobs. We use infrastructure providers (hosting,
              database, file storage) that process data only to run {APP_NAME}{' '}
              for us. We may disclose data if required by law.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">5. Security</h2>
            <p className="mt-2">
              Data in transit uses HTTPS. Access is limited to authenticated
              users in your workspace. No method of transmission or storage is
              100% secure; we take reasonable steps to protect your information.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">6. Retention</h2>
            <p className="mt-2">
              We keep account and project data while your workspace is active and
              as needed for the studio’s records. You may request account
              deletion; see our{' '}
              <a className="font-semibold text-[#7a573b] underline" href="/delete-account">
                delete account
              </a>{' '}
              page. We aim to complete verified deletion requests within 30 days,
              except where law or legitimate studio records require limited
              retention.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">7. Your choices</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>Update profile details in the app</li>
              <li>Deny or revoke location permission (attendance punch may then fail)</li>
              <li>Choose whether to upload photos or send messages</li>
              <li>
                Request account deletion via{' '}
                <a className="font-semibold text-[#7a573b] underline" href="/delete-account">
                  /delete-account
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">8. Children</h2>
            <p className="mt-2">
              {APP_NAME} is a workplace tool and is not directed at children under
              13. We do not knowingly collect data from children.
            </p>
          </section>

          <section>
            <h2 className="text-[16px] font-semibold text-[#1a1c1b]">9. Contact</h2>
            <p className="mt-2">
              Privacy questions or deletion requests:{' '}
              <a
                className="font-semibold text-[#7a573b] underline"
                href={`mailto:${SUPPORT_EMAIL}`}
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </section>
        </div>
      </article>
    </div>
  )
}
