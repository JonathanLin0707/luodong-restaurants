import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortControl from './SortControl.jsx'

describe('SortControl - 人氣排序與價位篩選', () => {
  it('提供人氣排序選項，選擇後呼叫 onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<SortControl sort="" onChange={onChange} onMinRatingChange={vi.fn()} onPriceLevelChange={vi.fn()} />)

    expect(screen.getByRole('option', { name: '依人氣（評論數多到少）' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('排序'), 'popular')
    expect(onChange).toHaveBeenCalledWith('popular')
  })

  it('價位下拉有不限與 0..4 六個選項，選擇後呼叫 onPriceLevelChange', async () => {
    const onPriceLevelChange = vi.fn()
    const user = userEvent.setup()
    render(<SortControl sort="" onChange={vi.fn()} minRating={0} onMinRatingChange={vi.fn()} priceLevel="" onPriceLevelChange={onPriceLevelChange} />)

    const priceSelect = screen.getByLabelText('價位')
    expect(priceSelect).toHaveValue('')
    for (const label of ['不限', '免費', '$ 便宜', '$$ 中等', '$$$ 昂貴', '$$$$ 非常昂貴']) {
      expect(within(priceSelect).getByRole('option', { name: label })).toBeInTheDocument()
    }

    await user.selectOptions(priceSelect, '2')
    expect(onPriceLevelChange).toHaveBeenCalledWith(2)
    await user.selectOptions(priceSelect, '0')
    expect(onPriceLevelChange).toHaveBeenCalledWith(0)
    await user.selectOptions(priceSelect, '')
    expect(onPriceLevelChange).toHaveBeenCalledWith('')
  })

  it('傳入的價位會反映在下拉選單', () => {
    render(<SortControl sort="popular" onChange={vi.fn()} priceLevel={4} onMinRatingChange={vi.fn()} onPriceLevelChange={vi.fn()} />)
    expect(screen.getByLabelText('價位')).toHaveValue('4')
    expect(screen.getByLabelText('排序')).toHaveValue('popular')
  })
})
