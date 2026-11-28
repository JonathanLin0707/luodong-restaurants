import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InstallButton from './InstallButton.jsx'

function makeInstallEvent(outcome = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome, platform: 'web' })
  return event
}

describe('InstallButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('預設不顯示（瀏覽器沒發出 beforeinstallprompt，例如 iOS 或不支援）', () => {
    render(<InstallButton />)
    expect(screen.queryByRole('button', { name: '安裝成 App' })).not.toBeInTheDocument()
  })

  it('收到 beforeinstallprompt 後顯示按鈕，並攔下瀏覽器預設的提示', () => {
    render(<InstallButton />)
    const event = makeInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(screen.getByRole('button', { name: '安裝成 App' })).toBeInTheDocument()
    expect(event.prompt).not.toHaveBeenCalled()
  })

  it('點擊（含鍵盤 Enter）才呼叫 prompt()，之後按鈕隱藏', async () => {
    const user = userEvent.setup()
    render(<InstallButton />)
    const event = makeInstallEvent()
    act(() => {
      window.dispatchEvent(event)
    })
    const button = screen.getByRole('button', { name: '安裝成 App' })
    button.focus()
    await user.keyboard('{Enter}')
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '安裝成 App' })).not.toBeInTheDocument()
  })

  it('收到 appinstalled 後隱藏按鈕', () => {
    render(<InstallButton />)
    act(() => {
      window.dispatchEvent(makeInstallEvent())
    })
    expect(screen.getByRole('button', { name: '安裝成 App' })).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(screen.queryByRole('button', { name: '安裝成 App' })).not.toBeInTheDocument()
  })

  it('已經以 App 模式（standalone）開啟時，就算收到事件也不顯示', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    try {
      render(<InstallButton />)
      act(() => {
        window.dispatchEvent(makeInstallEvent())
      })
      expect(screen.queryByRole('button', { name: '安裝成 App' })).not.toBeInTheDocument()
    } finally {
      delete window.matchMedia
    }
  })
})
