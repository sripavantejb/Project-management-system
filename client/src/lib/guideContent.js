/**
 * Content for the in-app "How to use EPM" guide (Profile → Guide tab).
 * One shared, static guide — not personalized to the viewer. Every topic
 * here maps to a real page/action in the client-facing app; platform-admin
 * (Editco internal) screens are intentionally left out.
 *
 * Shape of a topic:
 *  id        — unique key, also used for search result anchoring
 *  title     — heading shown in the article
 *  route     — path to open with the "Open this page" button (null if N/A)
 *  summary   — 1–3 sentences: what it is and why you'd use it
 *  steps     — array of strings: how to do the main thing on this page
 *  requires  — optional: what has to be true first (permissions, other data)
 *  result    — optional: what happens right after you do it
 *  actions   — optional array of { label, detail, result } for specific
 *              buttons/options on the page (e.g. "Delete", "Approve")
 *  keywords  — extra words the search should match
 */

import {
  Home,
  FolderKanban,
  CheckSquare,
  Calculator,
  FileText,
  Package,
  Wallet,
  Receipt,
  FileCheck2,
  Boxes,
  Camera,
  Target,
  BarChart3,
  Trophy,
  Users,
  ShieldCheck,
  LayoutDashboard,
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  MessageSquare,
  Smartphone,
  LogIn,
  Bell,
} from 'lucide-react'

export const GUIDE_SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting started',
    icon: LogIn,
    topics: [
      {
        id: 'sign-in',
        title: 'Signing in',
        route: null,
        summary:
          'Every account belongs to a workspace. You need your workspace name, your email, and your password to sign in — there is no self-signup.',
        steps: [
          'Go to the sign-in page and enter your Workspace name exactly as your admin gave it to you.',
          'Enter your work Email and Password.',
          'Choose Staff or Admin/Owner at the top of the form, matching your role.',
          'Select Sign in.',
        ],
        requires:
          'An account created by your company admin, owner, or HR — new people are always invited, never self-registered.',
        result:
          'You land on a different starting page depending on your role — most people land on My Work, admins land on the Company dashboard, and site supervisors land on Site mode.',
        actions: [
          {
            label: 'Forgot password',
            detail:
              'Select "Forgot password?" on the sign-in page and enter your email. If an account exists, you will get a reset email.',
            result: 'The same generic confirmation message appears either way, so this does not reveal whether an email is registered.',
          },
        ],
        keywords: ['login', 'workspace', 'password', 'admin', 'staff'],
      },
      {
        id: 'getting-invited',
        title: 'Getting added to a workspace',
        route: null,
        summary:
          'There is no public sign-up. Someone with People access (Admin, Owner, or HR) invites you by email, and you get a temporary password to log in with.',
        steps: [
          'Your admin sends you the workspace name, your email, and a temporary password.',
          'Sign in with those details.',
          'You will be asked to set a new password the first time.',
          'A short one-time welcome tour introduces the app before you land on your home screen.',
        ],
        result: 'From then on you sign in normally with your own password.',
        keywords: ['invite', 'new user', 'temporary password', 'onboarding'],
      },
      {
        id: 'onboarding',
        title: 'First-time welcome tour',
        route: '/onboarding',
        summary:
          'A short one-time set of steps shown the first time you log in: confirm your display name/role and see a quick tour of the app.',
        steps: ['Follow the on-screen steps.', 'Select Finish/Continue at the end.'],
        result: 'You will not see this again after completing it once.',
        keywords: ['tour', 'welcome', 'first login'],
      },
    ],
  },

  {
    id: 'home',
    label: 'Home / My Work',
    icon: Home,
    topics: [
      {
        id: 'my-work',
        title: 'My Work',
        route: '/',
        summary:
          'Your personal landing page — every task assigned to you, grouped by Assigned, Today, Later, Personal, and Done, plus quick counts for overdue items and comments.',
        steps: [
          'Use the tabs at the top (Assigned / Today / Later / Personal / Done / Overview) to change what you see.',
          'Select the status dot on the left of any task to move it to the next status.',
          'Type into "What do you need to do?" and press Enter to quickly add a personal to-do — only a title is needed.',
          'Select a task to open its full details.',
        ],
        result: 'Task changes update instantly and are reflected on the project as well.',
        actions: [
          {
            label: 'Connect Google Calendar',
            detail: 'Link your Google account from My Work to see your calendar events alongside your tasks.',
            result: 'Your upcoming meetings appear next to tasks with due dates.',
          },
        ],
        keywords: ['dashboard', 'tasks', 'today', 'overdue', 'personal tasks'],
      },
    ],
  },

  {
    id: 'projects',
    label: 'Projects',
    icon: FolderKanban,
    topics: [
      {
        id: 'projects-list',
        title: 'Projects',
        route: '/projects',
        summary:
          'Every project you have access to, as cards or a list, with search and status filters. This is where a new project starts.',
        steps: [
          'Select + New project.',
          'Enter Project name and Client name (both required).',
          'Optionally add client phone, property type (Residential/Commercial/Renovation/Custom), a space/folder, location, budget, and a cover photo.',
          'Select Create.',
        ],
        requires: 'Permission to create projects (most staff roles have this by default).',
        result:
          'A new project is created with five standard stages already set up — Design → Planning/BOQ → Procurement → Execution → Handover — plus a starter set of tasks.',
        actions: [
          {
            label: 'Delete a project',
            detail: 'Open the project menu and choose Delete. You will be asked to confirm.',
            result: 'The project and everything inside it (tasks, files, etc.) is permanently removed. This cannot be undone.',
          },
          {
            label: 'Upload a cover photo',
            detail: 'Select the project card\'s photo area and choose an image.',
            result: 'The photo shows on the project card and inside the project header.',
          },
        ],
        keywords: ['new project', 'create project', 'client', 'stages'],
      },
      {
        id: 'project-overview',
        title: 'Project Overview tab',
        route: null,
        summary:
          'Inside a project, the Overview tab shows what stage the project is in (Design, Planning/BOQ, Procurement, Execution, or Handover) and a short checklist of what to focus on next.',
        steps: [
          'Open a project, then select the Overview tab.',
          'Use the quick links to jump to Tasks, BOQ, Materials, or Site for this project.',
        ],
        result: 'Nothing changes automatically — moving stages happens when you take the related action (for example, approving a BOQ moves the project into Procurement).',
        keywords: ['stage', 'design', 'planning', 'procurement', 'execution', 'handover'],
      },
      {
        id: 'project-notes',
        title: 'Project Notes tab',
        route: null,
        summary: 'A running log of client meetings for one project — a simple place to note what was discussed and agreed.',
        steps: [
          'Open a project, select the Notes tab.',
          'Type your note and select Add.',
        ],
        requires: 'You can edit or delete only your own notes, unless you are the project manager or a company admin.',
        result: 'The note is added to the top of the log with your name and the date.',
        keywords: ['meeting notes', 'client meeting', 'log'],
      },
      {
        id: 'project-team',
        title: 'Project Team tab',
        route: null,
        summary: 'Shows everyone assigned to the project. Selecting a teammate opens a direct message with them.',
        requires: 'Permission to manage projects, to add or remove team members.',
        keywords: ['team members', 'assign people'],
      },
    ],
  },

  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckSquare,
    topics: [
      {
        id: 'task-board',
        title: 'Tasks board (inside a project)',
        route: null,
        summary:
          'A Kanban-style board grouped into Not started, Working on it, Needs check, Finished, and an automatic "Later" group for anything due more than two weeks out.',
        steps: [
          'Open a project and select the Tasks tab.',
          'Select + to add a task — a title is all that is required.',
          'On any task card, change the assignee, due date, or priority directly without opening it.',
          'Select a task title to open its full detail panel.',
        ],
        requires: 'Permission to manage tasks to edit fields inline; anyone with access can view.',
        keywords: ['kanban', 'board', 'to do', 'in progress'],
      },
      {
        id: 'task-detail',
        title: 'Task details panel',
        route: null,
        summary:
          'Opening any task shows its full detail: description, status, priority, assignee, dates, tags, a checklist, comments, a built-in time tracker, and any custom fields your workspace has added.',
        steps: [
          'Select a task from any board or list to open it.',
          'Edit any field directly — changes save automatically.',
          'Use Add checklist item to break the task into smaller steps.',
          'Type a comment and use @ to mention a teammate — they get notified.',
          'Select the timer icon to start or stop tracking time spent on this task.',
        ],
        result: 'All changes are visible immediately to everyone with access to the task, and mentioned teammates are notified.',
        keywords: ['checklist', 'mention', 'comment', 'time tracker', 'custom field', 'subtask'],
      },
      {
        id: 'live-board',
        title: 'Live board',
        route: '/live-board',
        summary: 'A company-wide, auto-refreshing view of every open task, so you can see who is working on what right now.',
        steps: [
          'Use the filters to narrow by status (Working / Not started / Needs check / Overdue / Urgent / Unassigned) or by person.',
        ],
        result: 'The board refreshes automatically roughly every 12 seconds — no need to reload the page.',
        keywords: ['who is working', 'overview', 'company wide tasks'],
      },
    ],
  },

  {
    id: 'boq',
    label: 'BOQ & Quotes',
    icon: Calculator,
    topics: [
      {
        id: 'boq-workspace',
        title: 'BOQ / Quotes workspace',
        route: '/boq',
        summary:
          'Where you build a Bill of Quantities and turn it into a client-ready quotation. Each project can have one or more BOQ sheets (for example "Standard").',
        steps: [
          'Select a project, then + New sheet, and choose Residential, Commercial, or a Materials/free-form sheet.',
          'For Commercial sheets, fill in the Measurements step first — room-by-room quantities feed the BOQ automatically.',
          'On the BOQ step, edit rates and amounts, add or duplicate line items, and add remarks or a photo per line.',
          'Open the Quotation step to see the finished, printable document with your logo and details.',
        ],
        requires: 'BOQ access (permission granted by your admin).',
        result: 'Totals (subtotal, charges %, GST %, discount, grand total) recalculate automatically as you edit.',
        actions: [
          {
            label: 'Delete a line item or a sheet',
            detail:
              'Use the row menu to delete a single line, or the sheet menu to delete the whole sheet. You will be asked to confirm.',
            result: 'Deleted items are removed immediately and are not recoverable — double-check before confirming.',
          },
          {
            label: 'Import from Excel',
            detail: 'Use Import to bring in a material list from an Excel file, matching the expected columns.',
            result: 'Rows are added to the current sheet as new line items.',
          },
          {
            label: 'Mark a quotation Approved',
            detail:
              'Change the status to Approved once the client has agreed. If your workspace has set up approval routing for BOQs to a specific person, only that person (or a company admin) can do this.',
            result:
              'The sheet locks against further edits (use Unlock to reopen it), the project budget is set to the grand total, and the project moves into the Procurement stage. Approving can also generate a matching GST tax invoice.',
          },
          {
            label: 'Unlock an approved BOQ',
            detail: 'Select Unlock on an approved sheet.',
            result: 'The previous approved copy is saved to History, and the sheet becomes an editable draft again.',
          },
          {
            label: 'Print / export the quotation',
            detail: 'Use Print on the Quotation step to produce a client-ready document.',
          },
        ],
        keywords: ['bill of quantities', 'quotation', 'measurements', 'approve', 'lock', 'unlock', 'delete', 'excel import', 'gst'],
      },
    ],
  },

  {
    id: 'files',
    label: 'Files & Drawings',
    icon: FileText,
    topics: [
      {
        id: 'project-files',
        title: 'Files tab (inside a project)',
        route: null,
        summary:
          'Upload and organize drawings, renders, and photos in folders: Concepts, Drawings, 3D Renders, Approvals, and Site photos.',
        steps: [
          'Open a project, select the Files tab, then choose a folder.',
          'Select Upload, or drag files directly onto the page.',
          'Use Send for approval on a file once it is ready for sign-off.',
        ],
        requires: 'Permission to manage files. Each file is limited to 4 MB.',
        result: 'Uploaded files appear immediately in the chosen folder. Sending for approval notifies the resolved approver by popup and, if configured, by email.',
        actions: [
          {
            label: 'Approve or reject a file',
            detail:
              'Only the specific person the file was routed to (or a company admin) can approve or reject it — from the notification popup, the Approvals inbox, or the file itself.',
            result: 'The decision is final — approved or rejected files are not re-reviewed; upload a new version instead if changes are needed.',
          },
          {
            label: 'Delete a file',
            detail: 'Use the file menu and confirm.',
            result: 'The file is permanently removed.',
          },
        ],
        keywords: ['drawings', 'upload', 'approval', 'renders', 'photos', '4mb limit'],
      },
    ],
  },

  {
    id: 'materials',
    label: 'Materials & Procurement',
    icon: Package,
    topics: [
      {
        id: 'materials-hub',
        title: 'Materials',
        route: '/procurement',
        summary:
          'The full procurement suite: Vendors, Purchase Orders, GRN (goods received), QC, Debit notes, Material requests, Issues, and an embedded view of Inventory and Invoices.',
        steps: [
          'Use the tabs across the top to move between Overview, Vendors, Purchase orders, and the rest.',
          'On Vendors, select + Vendor to add a supplier (name, contact, category, rating).',
          'On Purchase orders, select + New PO, pick the project and vendor, and add line items.',
        ],
        result: 'A purchase order moves through Draft → Approved → Ordered → In transit → Delivered as you update its status.',
        actions: [
          {
            label: 'Send a PO to a vendor',
            detail: 'Use Send on a purchase order to email or WhatsApp it directly to the vendor.',
          },
          {
            label: 'Log a GRN or QC result',
            detail: 'Use the GRN or QC tab to record what was received and its quality check outcome against a purchase order.',
          },
        ],
        keywords: ['vendors', 'purchase order', 'po', 'grn', 'qc', 'debit note', 'material request', 'procurement'],
      },
    ],
  },

  {
    id: 'revenue',
    label: 'Revenue',
    icon: Wallet,
    topics: [
      {
        id: 'revenue-finance',
        title: 'Revenue',
        route: '/finance',
        summary: 'Per-project profit and loss, expenses, and (for reviewers) expense approvals.',
        steps: [
          'Open the Expenses tab and select + Expense.',
          'Choose the Project, enter an Amount and a short Description, and pick a Category.',
          'Select Submit.',
        ],
        result: 'The expense is created as Pending and does not count toward project spend until it is approved.',
        actions: [
          {
            label: 'Approve or reject an expense',
            detail: 'On the Approvals tab, review a pending expense and select Approve or Reject.',
            result: 'Approving folds the amount into the project\'s recorded spend.',
          },
        ],
        requires: 'The Approvals tab is only visible to Admin, Owner, Project manager, and HR.',
        keywords: ['expense', 'p&l', 'budget vs spend', 'commitments'],
      },
    ],
  },

  {
    id: 'billing',
    label: 'Billing',
    icon: Receipt,
    topics: [
      {
        id: 'billing-page',
        title: 'Billing (vendor invoices)',
        route: '/billing',
        summary: 'Tracks bills you owe to vendors — separate from the tax invoices you send to clients.',
        steps: [
          'Select + Add invoice.',
          'Fill in Project, Invoice number, Vendor, linked Purchase order (optional), Amount, Invoice date, and Due date.',
          'Attach the invoice file (PDF or image) if you have one.',
        ],
        result: 'The invoice is tracked as Unpaid until you mark it Paid. Overdue status is calculated automatically from the due date.',
        keywords: ['vendor invoice', 'accounts payable', 'unpaid', 'overdue'],
      },
    ],
  },

  {
    id: 'tax-invoices',
    label: 'Tax Invoices',
    icon: FileCheck2,
    topics: [
      {
        id: 'tax-invoices-page',
        title: 'Tax Invoices',
        route: '/billing/tax-invoices',
        summary: 'GST-compliant invoices you issue to clients, with HSN/SAC codes, CGST+SGST or IGST, and an auto-generated invoice number.',
        steps: [
          'Select + New invoice, or generate one directly from an approved BOQ.',
          'Add line items with description, HSN/SAC code, GST rate, quantity, and rate.',
          'Fill in consignee, buyer, and bank details as needed.',
          'Select Print to produce the final document.',
        ],
        result: 'The invoice moves through Draft → Issued → Paid (or Cancelled).',
        keywords: ['gst', 'hsn', 'sac', 'cgst', 'sgst', 'igst', 'client invoice'],
      },
    ],
  },

  {
    id: 'inventory',
    label: 'Inventory',
    icon: Boxes,
    topics: [
      {
        id: 'inventory-page',
        title: 'Inventory',
        route: '/inventory',
        summary: 'A company-wide stock ledger — items on hand, and a log of every stock movement in or out.',
        steps: [
          'On the Stock tab, select + Item to add a new stock item (name, SKU, category, unit, reorder level, unit cost).',
          'On the Activity tab, record a movement as Received, Issued, or Adjusted, optionally linked to a project.',
        ],
        result: 'Items below their reorder level are flagged as low stock automatically.',
        keywords: ['stock', 'sku', 'reorder level', 'movements'],
      },
    ],
  },

  {
    id: 'site',
    label: 'Site Updates',
    icon: Camera,
    topics: [
      {
        id: 'site-feed',
        title: 'Site updates',
        route: '/site-feed',
        summary: 'A dated, photo-driven feed of on-site progress across all your projects.',
        steps: [
          'Select + Post update.',
          'Choose the Project, write a short note, set a progress percentage, and attach photos.',
          'Select Post.',
        ],
        result: 'The update appears in the feed immediately and on the project\'s own Site tab.',
        actions: [
          {
            label: 'Log a snag (site issue)',
            detail: 'From the project\'s Site tab, add a snag with a title — it is tracked as an open issue until resolved.',
          },
        ],
        keywords: ['site photos', 'progress update', 'snag', 'issue'],
      },
    ],
  },

  {
    id: 'leads',
    label: 'New Enquiries',
    icon: Target,
    topics: [
      {
        id: 'leads-page',
        title: 'New enquiries',
        route: '/leads',
        summary: 'A lightweight CRM for incoming enquiries, moving through New enquiry → Site visit → Mood board → Quotation sent → Negotiation, ending in Hot (won) or Dead (lost).',
        steps: [
          'Select + New enquiry and enter at least the client/company name.',
          'Optionally add a contact person, source, email, phone, estimated value, and next follow-up date.',
          'Move the enquiry through pipeline stages as it progresses.',
        ],
        result: 'Creating an enquiry automatically adds a follow-up task for you.',
        actions: [
          {
            label: 'Mark an enquiry as Hot',
            detail: 'Move the enquiry to the Hot stage once the client confirms.',
            result: 'A real project is created automatically from the enquiry, with an empty BOQ ready to fill in — you are taken there directly.',
          },
        ],
        keywords: ['crm', 'pipeline', 'enquiry', 'lead', 'convert to project'],
      },
    ],
  },

  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    topics: [
      {
        id: 'reports-page',
        title: 'Reports',
        route: '/reports',
        summary: 'Overview, People, and Projects tabs with charts and performance summaries across the company.',
        steps: [
          'Switch between the Overview, People, and Projects tabs.',
          'On People, sort or filter the team by overdue tasks, open tasks, or completion rate.',
          'On Projects, filter to see only at-risk projects.',
        ],
        result:
          'The "Ask a question" box on Overview answers a small set of preset questions (risk/delay, pipeline, budget, team, overdue) by matching keywords — it is not a free-form AI assistant, so it works best with those exact topics.',
        keywords: ['analytics', 'charts', 'performance', 'ask a question', 'at risk'],
      },
    ],
  },

  {
    id: 'impact',
    label: 'Impact Points',
    icon: Trophy,
    topics: [
      {
        id: 'impact-page',
        title: 'Impact Points',
        route: '/impact',
        summary: 'A recognition/leaderboard system. Points come from on-time task completion automatically, plus manual awards for things like great client feedback.',
        steps: [
          'View the Week / Month / All-time leaderboard.',
          'Badges (Rising Star, Consistent Performer, High Impact, Company Champion) unlock automatically at point milestones.',
        ],
        requires: 'The Rules tab (for manually awarding or deducting points) is only visible to people with manage permission.',
        keywords: ['leaderboard', 'points', 'badges', 'gamification', 'recognition'],
      },
    ],
  },

  {
    id: 'people',
    label: 'People',
    icon: Users,
    topics: [
      {
        id: 'people-page',
        title: 'People',
        route: '/admin',
        summary: 'The team directory — everyone in your workspace, their role, and (for admins) how to invite new people.',
        steps: [
          'Browse or search the directory.',
          'If you have People access: select + Invite, fill in Name, Email, and Role, and submit.',
        ],
        result: 'Inviting someone returns a temporary password and workspace login link to share with them directly — there is no automatic invite email.',
        requires: 'Full access to this page (inviting, resetting passwords) is limited to Admin, Owner, and HR.',
        keywords: ['team directory', 'invite', 'roles', 'reset password'],
      },
    ],
  },

  {
    id: 'approvals',
    label: 'Approvals',
    icon: ShieldCheck,
    topics: [
      {
        id: 'approvals-page',
        title: 'Approvals',
        route: '/approvals',
        summary:
          'Configure who needs to sign off on Purchase orders, BOQs, Expenses, Tasks, and Drawings/files — either by role and amount, or by pinning one specific person, regardless of amount.',
        steps: [
          'Choose a type (for example BOQ / Quotation).',
          'Select + Add routing.',
          'Leave "From amount" and "Up to" blank if the rule should apply no matter the value, or set a range for amount-based routing.',
          'Choose an Approver role, or use "Pin to a person" to always route to one specific teammate.',
          'Select Add routing to save the rule.',
        ],
        result:
          'From then on, matching items are sent to the resolved approver for a decision. For files and BOQs, only that specific person (or a company admin) can actually approve — having general access to the page is not enough once someone is pinned.',
        requires: 'Only Admin and Owner can open this page.',
        keywords: ['routing rules', 'approver', 'pin a person', 'amount band', 'who approves'],
      },
    ],
  },

  {
    id: 'company-admin',
    label: 'Company dashboard',
    icon: LayoutDashboard,
    topics: [
      {
        id: 'company-admin-page',
        title: 'Company dashboard',
        route: '/company-admin',
        summary: 'A read-only executive summary for Admin/Owner: project counts, budget vs. spend, recent activity, and project health across a chosen date range.',
        steps: ['Choose a date range (30 days / 90 days / 12 months / all time) to change what the numbers cover.'],
        keywords: ['executive summary', 'kpi', 'company overview'],
      },
    ],
  },

  {
    id: 'inbox',
    label: 'Inbox',
    icon: InboxIcon,
    topics: [
      {
        id: 'inbox-page',
        title: 'Inbox',
        route: '/inbox',
        summary: 'One place for everything that needs your attention: system notifications (Primary), 1:1 messages with teammates (Company Mail), snoozed items (Later), and Cleared history.',
        steps: [
          'Select the Primary tab to see notifications — mark them read, snooze with Later, or Clear.',
          'Select Company Mail, then + New message, choose a teammate, and write your message.',
        ],
        result: 'A popup also appears live on screen for important notifications (task assignments, mentions, approvals, deadlines) if your workspace has them turned on.',
        keywords: ['notifications', 'messages', 'mentions', 'company mail', 'popup', 'later', 'cleared'],
      },
      {
        id: 'notification-settings',
        title: 'Notification preferences (Email & alerts)',
        route: '/settings',
        summary: 'Choose, per event type, whether people get a popup, an email, or both — and whether the target person, the actor, or admins are included.',
        requires: 'Only Admin and Owner can edit this; it lives under Settings → Email & alerts. Email only sends if workspace SMTP is configured here.',
        keywords: ['smtp', 'email settings', 'popup settings', 'alerts'],
      },
    ],
  },

  {
    id: 'assigned-comments',
    label: 'Assigned Comments',
    icon: MessageSquare,
    topics: [
      {
        id: 'assigned-comments-page',
        title: 'Assigned Comments',
        route: '/assigned-comments',
        summary: 'A flat list of every comment that mentions you or was specifically assigned to you, so nothing gets missed inside a busy task.',
        keywords: ['mentions', 'comments assigned to me'],
      },
    ],
  },

  {
    id: 'mobile-site-mode',
    label: 'Site mode',
    icon: Smartphone,
    topics: [
      {
        id: 'site-mode-page',
        title: 'Site mode',
        route: '/mobile',
        summary: 'A simplified, phone-friendly version of the app with four big shortcuts: Post site update, My tasks, Log expense, and Log snag — built for using on-site with one hand.',
        requires: 'The Site permission. Site supervisors land here automatically after signing in.',
        keywords: ['field mode', 'site supervisor', 'phone friendly'],
      },
    ],
  },

  {
    id: 'settings',
    label: 'Settings',
    icon: SettingsIcon,
    topics: [
      {
        id: 'settings-account',
        title: 'Account settings',
        route: '/settings',
        summary: 'Your personal profile — name, title, photo, and password — plus, if you have People access, inviting new teammates.',
        steps: [
          'Update your Name or Title and select Save changes.',
          'Select your avatar to upload or remove a profile photo.',
          'Use Change password to set a new password (you will need your current one).',
        ],
        keywords: ['profile', 'avatar', 'change password', 'invite teammate'],
      },
    ],
  },

  {
    id: 'notifications-bell',
    label: 'Notification bell',
    icon: Bell,
    topics: [
      {
        id: 'notifications-bell-topic',
        title: 'The bell icon',
        route: '/inbox?tab=primary',
        summary: 'The bell in the top header shows a badge when you have unread notifications. Selecting it takes you straight to your Inbox.',
        keywords: ['unread badge', 'header'],
      },
    ],
  },
]

/** Flat list of every topic with its section attached, for search. */
export function flattenGuideTopics() {
  const out = []
  for (const section of GUIDE_SECTIONS) {
    for (const topic of section.topics) {
      out.push({ ...topic, sectionId: section.id, sectionLabel: section.label, sectionIcon: section.icon })
    }
  }
  return out
}

/** Simple, dependency-free relevance search across title/summary/keywords/actions. */
export function searchGuideTopics(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const all = flattenGuideTopics()
  const scored = []
  for (const topic of all) {
    const haystacks = [
      topic.title,
      topic.summary,
      topic.sectionLabel,
      ...(topic.keywords || []),
      ...(topic.actions || []).flatMap((a) => [a.label, a.detail]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (!haystacks.includes(q)) continue
    const titleHit = topic.title.toLowerCase().includes(q)
    scored.push({ topic, score: titleHit ? 2 : 1 })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.topic)
}
