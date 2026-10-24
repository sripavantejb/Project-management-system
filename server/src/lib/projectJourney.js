import { Project } from '../models/Project.js'

export const JOURNEY_STAGES = [
  'design',
  'planning',
  'procurement',
  'execution',
  'handover',
]

/**
 * Move a project forward on the journey bar — never backwards.
 * Keeps the stages[] checklist in sync.
 * @returns {boolean} true if the stage changed
 */
export function applyStageForward(project, targetStage) {
  if (!project || !targetStage) return false
  const cur = JOURNEY_STAGES.indexOf(project.currentStage || 'design')
  const next = JOURNEY_STAGES.indexOf(targetStage)
  if (next < 0 || next <= cur) return false

  project.currentStage = targetStage

  if (Array.isArray(project.stages) && project.stages.length) {
    for (const s of project.stages) {
      const si = JOURNEY_STAGES.indexOf(s.key)
      if (si < 0) continue
      if (si < next) {
        s.status = 'completed'
        s.progress = 100
      } else if (si === next) {
        s.status = 'in_progress'
        s.progress = Math.max(Number(s.progress) || 0, 10)
      }
    }
    project.markModified('stages')
  }

  return true
}

/**
 * Auto-advance from real work events.
 * Events: 'boq_started' | 'boq_approved' | 'buying_started' | 'site_started' | 'handover_ready'
 */
export async function bumpProjectJourney(projectId, event) {
  if (!projectId || !event) return null

  const target =
    event === 'boq_started'
      ? 'planning'
      : event === 'boq_approved'
        ? 'procurement'
        : event === 'buying_started'
          ? 'execution'
          : event === 'site_started'
            ? 'execution'
            : event === 'handover_ready'
              ? 'handover'
              : null

  if (!target) return null

  const project = await Project.findById(projectId)
  if (!project) return null

  if (applyStageForward(project, target)) {
    await project.save()
  }
  return project
}
