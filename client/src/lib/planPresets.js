/** Default page bundles per subscription plan (platform admin can apply). */

const ALL_ON = {
  companyAdmin: true,
  approvals: true,
  portfolio: true,
  reports: true,
  liveBoard: true,
  projects: true,
  myWork: true,
  attendance: true,
  leads: true,
  boq: true,
  procurement: true,
  finance: true,
  billing: true,
  inventory: true,
  site: true,
  impact: true,
  people: true,
}

export const PLAN_FEATURE_PRESETS = {
  starter: {
    ...ALL_ON,
    boq: false,
    procurement: false,
    finance: false,
    billing: false,
    leads: false,
    impact: false,
    inventory: false,
    liveBoard: false,
    approvals: false,
  },
  pro: {
    ...ALL_ON,
    inventory: false,
  },
  enterprise: {
    ...ALL_ON,
  },
}

export const PLAN_SEAT_DEFAULTS = {
  starter: 10,
  pro: 30,
  enterprise: 100,
}
