import * as Location from 'expo-location'
import type { PunchLocation } from '../../api/attendance'

const TIMEOUT_MS = 12000

/**
 * Foreground fix only. Nothing is read until the person taps punch in or out,
 * and the app never asks for background location.
 */
export async function capturePunchLocation(): Promise<PunchLocation> {
  const perm = await Location.requestForegroundPermissionsAsync()
  if (perm.status !== 'granted') {
    throw new Error('Allow location so the studio can see where this punch happened. It is only read when you tap the button.')
  }

  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('Location is taking too long. Turn location on, then try again.')),
        TIMEOUT_MS,
      )
    }),
  ])

  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
  }
}
