import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

/** Light tactile feedback on native only; silently no-ops on the web. */
export function tap(style: ImpactStyle = ImpactStyle.Light) {
  if (!Capacitor.isNativePlatform()) return
  Haptics.impact({ style }).catch(() => {})
}

export function tapSuccess() {
  if (!Capacitor.isNativePlatform()) return
  Haptics.notification({ type: NotificationType.Success }).catch(() => {})
}
