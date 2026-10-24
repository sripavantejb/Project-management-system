import { Alert } from 'react-native'
import { attendanceApi } from '../../api/attendance'
import { authApi } from '../../api/auth'
import { isApiError } from '../../api/client'
import { capturePunchLocation } from './location'

function messageOf(err: unknown) {
  if (isApiError(err)) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

async function stillPunchedIn() {
  try {
    const today = await attendanceApi.today()
    if (!today.eligible) return false
    return !!today.record?.punchIn && !today.record?.punchOut
  } catch {
    return false
  }
}

async function leave(refreshToken: string | null, logout: () => void) {
  try {
    await authApi.logout(refreshToken)
  } finally {
    logout()
  }
}

async function punchOutThenLeave(refreshToken: string | null, logout: () => void) {
  try {
    const pin = await capturePunchLocation()
    await attendanceApi.punchOut(pin)
    await leave(refreshToken, logout)
  } catch (err) {
    Alert.alert('Could not punch out', messageOf(err))
  }
}

/** Sign out immediately, or punch out first when the day is still open. */
export function confirmSignOut(refreshToken: string | null, logout: () => void) {
  void (async () => {
    const open = await stillPunchedIn()
    if (open) {
      Alert.alert(
        'Punch out before you leave',
        'Your day is still open. Punch out saves where you finished, then signs you out.',
        [
          { text: 'Stay signed in', style: 'cancel' },
          { text: 'Punch out and sign out', onPress: () => void punchOutThenLeave(refreshToken, logout) },
        ],
      )
      return
    }

    Alert.alert('Sign out', 'You’ll need to sign in again to see your work.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void leave(refreshToken, logout) },
    ])
  })()
}
