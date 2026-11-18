import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestaurantCard from './RestaurantCard.jsx'

function base(overrides = {}) {
  return {
    placeId: 'p1',
    name: '羅東夜市小吃',
    rating: 4.5,
    userRatingsTotal: 120,
    address: '宜蘭縣羅東鎮民權路1號',
    category: '小吃',
    mapsUrl: 'https://maps.google.com/?cid=p1',
    ...overrides,
  }
}

describe('RestaurantCard - 營業狀態', () => {
  it('schedule + true', () => {
    render(<RestaurantCard restaurant={base({ isOpen: true, isOpenBasis: 'schedule' })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    const badge = screen.getByText('營業中')
    expect(badge).toHaveAttribute('title', '依營業時段判定')
    expect(badge).toHaveClass('open-status-open')
  })

  it('schedule + false', () => {
    render(<RestaurantCard restaurant={base({ isOpen: false, isOpenBasis: 'schedule' })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    const badge = screen.getByText('休息中')
    expect(badge).toHaveAttribute('title', '依營業時段判定')
    expect(badge).toHaveClass('open-status-closed')
  })

  it('snapshot + true', () => {
    render(<RestaurantCard restaurant={base({ isOpen: true, isOpenBasis: 'snapshot' })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    const badge = screen.getByText('查詢時營業中')
    expect(badge).toHaveAttribute('title', '此為抓取時狀態，可能已過期')
    expect(badge).toHaveClass('open-status-open')
  })

  it('snapshot + false', () => {
    render(<RestaurantCard restaurant={base({ isOpen: false, isOpenBasis: 'snapshot' })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    const badge = screen.getByText('查詢時休息中')
    expect(badge).toHaveAttribute('title', '此為抓取時狀態，可能已過期')
    expect(badge).toHaveClass('open-status-closed')
  })

  it('basis null', () => {
    render(<RestaurantCard restaurant={base({ isOpen: null, isOpenBasis: null })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    expect(screen.queryByText('營業中')).not.toBeInTheDocument()
    expect(screen.queryByText('休息中')).not.toBeInTheDocument()
    expect(screen.queryByText('查詢時營業中')).not.toBeInTheDocument()
    expect(screen.queryByText('查詢時休息中')).not.toBeInTheDocument()
  })

  it('isOpen null with basis', () => {
    render(<RestaurantCard restaurant={base({ isOpen: null, isOpenBasis: 'schedule' })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    expect(screen.queryByText('營業中')).not.toBeInTheDocument()
    expect(screen.queryByText('休息中')).not.toBeInTheDocument()
  })
})

describe('RestaurantCard - 價位', () => {
  it.each([
    [0, '免費'],
    [1, '$'],
    [2, '$$'],
    [3, '$$$'],
    [4, '$$$$'],
  ])('priceLevel %i', (level, text) => {
    render(<RestaurantCard restaurant={base({ priceLevel: level })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    const el = screen.getByText(text)
    expect(el).toHaveClass('price-level')
  })

  it('priceLevel null', () => {
    render(<RestaurantCard restaurant={base({ priceLevel: null })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    expect(screen.queryByText('免費')).not.toBeInTheDocument()
  })

  it('aria-label', () => {
    const labels = ['免費', '便宜', '中等', '昂貴', '非常昂貴']
    labels.forEach((label, level) => {
      const { unmount } = render(<RestaurantCard restaurant={base({ priceLevel: level })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
      expect(screen.getByLabelText('價位：' + label)).toBeInTheDocument()
      unmount()
    })
  })
})

describe('RestaurantCard - 距離', () => {
  it.each([
    [616, '616 m'],
    [999.6, '999 m'],
    [1000, '1.0 km'],
    [1616, '1.6 km'],
    [1999, '1.9 km'],
  ])('distance %s', (meters, text) => {
    render(<RestaurantCard restaurant={base({ distanceMeters: meters })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    expect(screen.getByText(text)).toBeInTheDocument()
    expect(screen.getByText(text)).toHaveAttribute('title', '距搜尋位置')
  })

  it('distance null', () => {
    render(<RestaurantCard restaurant={base({ distanceMeters: null })} onSelect={vi.fn()} onOpenMaps={vi.fn()} />)
    expect(screen.queryByText(/m$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/km$/)).not.toBeInTheDocument()
  })
})

describe('RestaurantCard - 互動', () => {
  it('click card', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<RestaurantCard restaurant={base()} onSelect={onSelect} onOpenMaps={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /在地圖上顯示/ }))
    expect(onSelect).toHaveBeenCalled()
  })

  it('open maps', async () => {
    const onOpenMaps = vi.fn()
    const user = userEvent.setup()
    render(<RestaurantCard restaurant={base()} onSelect={vi.fn()} onOpenMaps={onOpenMaps} />)
    await user.click(screen.getByRole('button', { name: /在 Google 地圖開啟/ }))
    expect(onOpenMaps).toHaveBeenCalled()
  })
})
