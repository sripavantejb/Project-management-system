import { http } from './client'
import type { ActivityLogItem, Comment, LiveBoard, Task } from '../types/models'

export interface CreateTaskPayload {
  title: string
  description?: string
  projectId?: string
  isPersonal?: boolean
  status?: Task['status']
  priority?: Task['priority']
  dueDate?: string | null
  startDate?: string | null
  assignee?: string
  timeEstimate?: number | null
  tags?: string[]
  checklist?: { text: string; done: boolean }[]
}

export const tasksApi = {
  list: (params?: { projectId?: string; status?: string; assignee?: string }) =>
    http.get<{ success: true; tasks: Task[] }>('/tasks', { params }).then((r) => r.data.tasks),

  get: (id: string) =>
    http
      .get<{ success: true; task: Task; comments: Comment[]; activity: ActivityLogItem[] }>(`/tasks/${id}`)
      .then((r) => r.data),

  create: (payload: CreateTaskPayload) =>
    http.post<{ success: true; task: Task }>('/tasks', payload).then((r) => r.data.task),

  update: (id: string, payload: Partial<Task> & { timeTrackingUserId?: string | null }) =>
    http.patch<{ success: true; task: Task }>(`/tasks/${id}`, payload).then((r) => r.data.task),

  /** Live team board — every open task, plus per-person load. Polled. */
  liveBoard: () =>
    http.get<{ success: true; data: LiveBoard }>('/tasks/live-board').then((r) => r.data.data),

  activeTimer: () =>
    http.get<{ success: true; task: Task | null }>('/tasks/active-timer').then((r) => r.data.task),

  remove: (id: string) => http.delete<{ success: true }>(`/tasks/${id}`).then((r) => r.data),

  addComment: (id: string, body: string) =>
    http
      .post<{ success: true; comment: Comment }>(`/tasks/${id}/comments`, { body })
      .then((r) => r.data.comment),
}
