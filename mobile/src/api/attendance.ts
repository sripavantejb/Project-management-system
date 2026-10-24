import { http } from './client'

export type PunchPin = {
  at: string
  latitude: number
  longitude: number
  accuracy: number | null
}

export type AttendanceUser = {
  id: string
  name: string
  email: string
  role: string
  avatar: string
  title: string
}

export type AttendanceRecord = {
  id: string
  workDate: string
  punchIn: PunchPin | null
  punchOut: PunchPin | null
  user?: AttendanceUser | null
}

export type PunchLocation = {
  latitude: number
  longitude: number
  accuracy: number | null
}

export const attendanceApi = {
  today: async () => {
    const { data } = await http.get<{
      eligible: boolean
      canReview: boolean
      workDate: string
      record: AttendanceRecord | null
    }>('/attendance/today')
    return data
  },
  punchIn: async (pin: PunchLocation) => {
    const { data } = await http.post<{ record: AttendanceRecord }>('/attendance/punch-in', pin)
    return data.record
  },
  punchOut: async (pin: PunchLocation) => {
    const { data } = await http.post<{ record: AttendanceRecord }>('/attendance/punch-out', pin)
    return data.record
  },
  mine: async () => {
    const { data } = await http.get<{ records: AttendanceRecord[] }>('/attendance/mine', {
      params: { limit: 14 },
    })
    return data.records
  },
  team: async (date: string) => {
    const { data } = await http.get<{
      date: string
      people: { user: AttendanceUser; record: AttendanceRecord | null }[]
    }>('/attendance/team', { params: { date } })
    return data
  },
}
