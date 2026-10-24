import { api } from './api'

function captureBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available in this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => reject(new Error('Allow location so this punch can be saved.')),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 20000 },
    )
  })
}

/** Sign out, punching out first when the India work day is still open. */
export async function signOutWithAttendance({ logout, navigate }) {
  let open = false
  try {
    const today = await api('/attendance/today')
    open = today?.eligible !== false && today?.record?.punchIn && !today?.record?.punchOut
  } catch {
    open = false
  }

  if (open) {
    const ok = window.confirm('Your day is still open. Punch out now, then sign out?')
    if (!ok) return
    try {
      const pin = await captureBrowserLocation()
      await api('/attendance/punch-out', { method: 'POST', body: JSON.stringify(pin) })
    } catch (err) {
      window.alert(err?.message || 'Could not punch out. Stay signed in and try from Attendance.')
      return
    }
  }

  logout()
  navigate('/login')
}
