import { useEffect, useState } from 'react'
import { isStandaloneDisplay } from '../pwa.js'

// 只有瀏覽器發出 beforeinstallprompt 時才顯示；裝好（appinstalled）或已在 App 模式開啟就隱藏。
// iOS Safari 不會發這個事件，所以 iOS 上不會出現按鈕（改走「分享 → 加入主畫面」）。
export default function InstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    if (isStandaloneDisplay()) return undefined

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const handleInstalled = () => setDeferredPrompt(null)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (!deferredPrompt) return null

  const handleClick = async () => {
    const promptEvent = deferredPrompt
    // prompt() 只能呼叫一次，先清掉；使用者取消後瀏覽器之後可能再發一次事件。
    setDeferredPrompt(null)
    try {
      await promptEvent.prompt()
      await promptEvent.userChoice
    } catch {
      // 瀏覽器拒絕顯示安裝視窗時不影響主畫面。
    }
  }

  return (
    <button type="button" className="install-app-button" onClick={handleClick}>
      安裝成 App
    </button>
  )
}
