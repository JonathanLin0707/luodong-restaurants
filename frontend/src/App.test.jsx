import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App.jsx'
import * as api from './api.js'
import * as mapsLoader from './mapsLoader.js'
import taiwanDistricts from './data/taiwan-districts.json'

vi.mock('./api.js')
vi.mock('./mapsLoader.js')

let createdMarkers = []
let createdMaps = []
let createdInfoWindows = []
let createdAutocompleteElements = []

class FakeMap {
  constructor(container, options) {
    this.container = container
    this.options = options
    this.panTo = vi.fn()
    this.setCenter = vi.fn()
    createdMaps.push(this)
  }
}

class FakeMarker {
  constructor(options) {
    this.options = options
    this.listeners = {}
    this.setAnimation = vi.fn()
    createdMarkers.push(this)
  }
  addListener(event, callback) {
    this.listeners[event] = callback
  }
  setMap() {}
}

class FakeInfoWindow {
  constructor() {
    this.open = vi.fn()
    this.close = vi.fn()
    this.setContent = vi.fn()
    createdInfoWindows.push(this)
  }
}

class FakePlaceAutocompleteElement extends HTMLElement {
  constructor() {
    super()
    createdAutocompleteElements.push(this)
  }
}

if (!customElements.get('fake-gmp-place-autocomplete')) {
  customElements.define('fake-gmp-place-autocomplete', FakePlaceAutocompleteElement)
}

const fakeMapsApi = {
  Map: FakeMap,
  Marker: FakeMarker,
  InfoWindow: FakeInfoWindow,
  Animation: { BOUNCE: 'BOUNCE' },
  places: { PlaceAutocompleteElement: FakePlaceAutocompleteElement },
}

const DEFAULT_LOCATION = { lat: 24.6778, lng: 121.7684, label: '宜蘭縣羅東鎮' }

function fireGmpSelect(element, place) {
  const event = new Event('gmp-select')
  event.placePrediction = { toPlace: () => place }
  element.dispatchEvent(event)
}

async function pickLocation(location = DEFAULT_LOCATION) {
  await waitFor(() => expect(createdAutocompleteElements.length).toBeGreaterThan(0))
  const element = createdAutocompleteElements[createdAutocompleteElements.length - 1]
  const place = {
    location: { lat: () => location.lat, lng: () => location.lng },
    formattedAddress: location.label,
    fetchFields: vi.fn().mockResolvedValue(undefined),
  }
  await act(async () => {
    fireGmpSelect(element, place)
    await Promise.resolve()
  })
}

const sampleRestaurants = [
  {
    placeId: 'p1',
    name: '羅東夜市小吃',
    rating: 4.5,
    userRatingsTotal: 120,
    address: '宜蘭縣羅東鎮民權路1號',
    lat: 24.678,
    lng: 121.768,
    category: '小吃',
    mapsUrl: 'https://maps.google.com/?cid=p1',
  },
  {
    placeId: 'p2',
    name: '林場肉羹',
    rating: 4.2,
    userRatingsTotal: 80,
    address: '宜蘭縣羅東鎮中正北路2號',
    lat: 24.679,
    lng: 121.769,
    category: '台式',
    mapsUrl: 'https://maps.google.com/?cid=p2',
  },
]

const sampleCategories = ['小吃', '台式']

const manyRestaurants = Array.from({ length: 7 }, (_, i) => ({
  placeId: `c${i + 1}`,
  name: `候選店${i + 1}`,
  rating: 4.0,
  userRatingsTotal: 50,
  address: `宜蘭縣羅東鎮測試路${i + 1}號`,
  lat: 24.68 + i * 0.001,
  lng: 121.77 + i * 0.001,
  category: '小吃',
  mapsUrl: `https://maps.google.com/?cid=c${i + 1}`,
}))

beforeEach(() => {
  vi.resetAllMocks()
  createdMarkers = []
  createdMaps = []
  createdInfoWindows = []
  createdAutocompleteElements = []
  mapsLoader.loadGoogleMaps.mockResolvedValue(fakeMapsApi)
  window.open = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(window.navigator, 'geolocation', {
    value: { getCurrentPosition: vi.fn() },
    configurable: true,
  })
})

describe('App - 初始畫面（尚未選擇地點）', () => {
  it('一進畫面只顯示地點選擇器，不會呼叫任何清單/分類 API', async () => {
    render(<App />)

    expect(screen.getByLabelText('地點')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用目前位置' })).toBeInTheDocument()
    expect(screen.getAllByText('請先選擇地點，才能顯示附近餐廳。')).toHaveLength(1)
    expect(screen.queryByText('載入中…')).not.toBeInTheDocument()
    expect(api.fetchCategories).not.toHaveBeenCalled()
    expect(api.fetchRestaurants).not.toHaveBeenCalled()
  })
})

describe('App - 透過地點自動完成選擇地點後載入附近餐廳', () => {
  it('選到地點後才會帶正確 lat/lng/radius 打 API', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    render(<App />)
    await pickLocation()

    await waitFor(() =>
      expect(api.fetchCategories).toHaveBeenCalledWith({
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        radius: 4000,
      }),
    )
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenCalledWith({
        category: undefined,
        sort: undefined,
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        radius: 4000,
      }),
    )
    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
    expect(screen.getByText(`附近餐廳推薦：${DEFAULT_LOCATION.label}`)).toBeInTheDocument()
  })

  it('選到沒有 geometry 的結果時會忽略，保留原本地點不變', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    render(<App />)
    await pickLocation()
    await screen.findByText('羅東夜市小吃')
    api.fetchRestaurants.mockClear()

    const element = createdAutocompleteElements[createdAutocompleteElements.length - 1]
    const placeWithoutLocation = {
      formattedAddress: '沒有座標的地點',
      fetchFields: vi.fn().mockResolvedValue(undefined),
    }
    await act(async () => {
      fireGmpSelect(element, placeWithoutLocation)
      await Promise.resolve()
    })

    expect(api.fetchRestaurants).not.toHaveBeenCalled()
    expect(screen.getByText(`附近餐廳推薦：${DEFAULT_LOCATION.label}`)).toBeInTheDocument()
  })
})

describe('App - 使用目前位置', () => {
  it('允許定位時會用取得的座標載入附近餐廳', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)
    navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: 25.03, longitude: 121.56 } })
    })

    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '使用目前位置' }))

    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenCalledWith({
        category: undefined,
        sort: undefined,
        lat: 25.03,
        lng: 121.56,
        radius: 4000,
      }),
    )
    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
  })

  it('定位被拒絕時顯示提示訊息，畫面不會壞掉，手動搜尋欄位仍可用', async () => {
    navigator.geolocation.getCurrentPosition.mockImplementation((success, error) => {
      error({ code: 1, message: 'User denied Geolocation' })
    })

    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '使用目前位置' }))

    expect(
      await screen.findByText('無法取得目前位置，請改用搜尋欄位輸入地點。'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('地點')).toBeEnabled()
    expect(api.fetchRestaurants).not.toHaveBeenCalled()

    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)
    await pickLocation()

    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
  })

  it('裝置不支援定位時顯示提示訊息而不是整頁壞掉', async () => {
    Object.defineProperty(window.navigator, 'geolocation', {
      value: undefined,
      configurable: true,
    })

    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '使用目前位置' }))

    expect(
      await screen.findByText('此裝置不支援定位功能，請改用搜尋欄位輸入地點。'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('地點')).toBeEnabled()
  })
})

describe('App - 清單渲染（含分類篩選、排序）', () => {
  it('載入中顯示 loading 狀態', async () => {
    let resolveFetch
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    render(<App />)
    await pickLocation()

    expect(screen.getByText('載入中…')).toBeInTheDocument()
    resolveFetch(sampleRestaurants)
    await waitFor(() => expect(screen.getByText('羅東夜市小吃')).toBeInTheDocument())
  })

  it('成功取得資料後渲染所有餐廳與分類標籤', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    render(<App />)
    await pickLocation()

    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
    expect(screen.getByText('林場肉羹')).toBeInTheDocument()
    const listItems = screen.getAllByRole('listitem')
    expect(listItems).toHaveLength(2)
    expect(within(listItems[0]).getByText('小吃')).toBeInTheDocument()
    expect(within(listItems[1]).getByText('台式')).toBeInTheDocument()
  })

  it('清單為空時顯示空狀態訊息', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue([])

    render(<App />)
    await pickLocation()

    expect(await screen.findByText('找不到符合條件的餐廳。')).toBeInTheDocument()
  })

  it('載入失敗時顯示錯誤訊息並可重試', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockRejectedValueOnce(new Error('請求失敗 (500)'))

    render(<App />)
    await pickLocation()

    expect(await screen.findByText('載入餐廳資料失敗。')).toBeInTheDocument()

    api.fetchRestaurants.mockResolvedValueOnce(sampleRestaurants)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '重試' }))

    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
  })

  it('選擇分類後會帶 category 參數重新查詢', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    api.fetchRestaurants.mockResolvedValueOnce([sampleRestaurants[1]])

    await user.selectOptions(screen.getByLabelText('分類篩選'), '台式')

    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenLastCalledWith({
        category: '台式',
        sort: undefined,
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        radius: 4000,
      }),
    )
  })

  it('勾選依星數排序後會帶 sort=rating 重新查詢', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    api.fetchRestaurants.mockResolvedValueOnce(sampleRestaurants)

    await user.click(screen.getByRole('checkbox', { name: /依星數排序/ }))

    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenLastCalledWith({
        category: undefined,
        sort: 'rating',
        lat: DEFAULT_LOCATION.lat,
        lng: DEFAULT_LOCATION.lng,
        radius: 4000,
      }),
    )
  })
})

describe('App - 清單與地圖選取連動', () => {
  it('點擊清單項目會選取該餐廳、讓地圖置中並觸發 marker 動畫', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))

    await user.click(screen.getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' }))

    expect(createdMaps[0].panTo).toHaveBeenCalledWith({
      lat: sampleRestaurants[0].lat,
      lng: sampleRestaurants[0].lng,
    })
    const marker = createdMarkers.find((m) => m.options.title === '羅東夜市小吃')
    expect(marker.setAnimation).toHaveBeenCalledWith('BOUNCE')
    expect(createdInfoWindows[0].open).toHaveBeenCalled()

    const card = screen
      .getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' })
      .closest('li')
    expect(card).toHaveClass('restaurant-card-selected')
  })

  it('按 Enter 鍵也能觸發選取（鍵盤可操作性）', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    const card = await screen.findByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' })
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))
    card.focus()
    await user.keyboard('{Enter}')

    expect(createdMaps[0].panTo).toHaveBeenCalledWith({
      lat: sampleRestaurants[0].lat,
      lng: sampleRestaurants[0].lng,
    })
    expect(card.closest('li')).toHaveClass('restaurant-card-selected')
  })

  it('點擊地圖上的 marker 會同步清單的選取高亮', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))

    const marker = createdMarkers.find((m) => m.options.title === '林場肉羹')
    await act(async () => {
      marker.listeners.click()
    })

    await waitFor(() => {
      const card = screen.getByRole('button', { name: '在地圖上顯示 林場肉羹 的位置' }).closest('li')
      expect(card).toHaveClass('restaurant-card-selected')
    })
    expect(window.open).not.toHaveBeenCalled()
  })

  it('點擊地圖上的 marker 會讓清單自動捲動到對應項目', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))

    const card = screen.getByRole('button', { name: '在地圖上顯示 林場肉羹 的位置' }).closest('li')
    expect(card.scrollIntoView).not.toHaveBeenCalled()

    const marker = createdMarkers.find((m) => m.options.title === '林場肉羹')
    await act(async () => {
      marker.listeners.click()
    })

    await waitFor(() => expect(card.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' }))
  })

  it('重複點擊同一筆餐廳會重新觸發一次視覺提示', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))

    const target = screen.getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' })
    await user.click(target)
    const marker = createdMarkers.find((m) => m.options.title === '羅東夜市小吃')
    expect(marker.setAnimation).toHaveBeenCalledTimes(1)

    await user.click(target)
    expect(marker.setAnimation).toHaveBeenCalledTimes(2)
  })

  it('切換分類篩選後，若原選取的餐廳不在新結果中，選取狀態會被清除', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await waitFor(() => expect(createdMarkers).toHaveLength(sampleRestaurants.length))
    await user.click(screen.getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' }))

    api.fetchRestaurants.mockResolvedValueOnce([sampleRestaurants[1]])
    await user.selectOptions(screen.getByLabelText('分類篩選'), '台式')

    await waitFor(() => expect(screen.queryByText('羅東夜市小吃')).not.toBeInTheDocument())
    await waitFor(() => expect(createdInfoWindows[0].close).toHaveBeenCalled())
  })
})

describe('App - 開啟 Google 地圖（次要操作）', () => {
  it('點擊「在 Google 地圖開啟」按鈕仍會用 mapsUrl 開新分頁', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.click(screen.getByRole('button', { name: '在 Google 地圖開啟 羅東夜市小吃' }))

    expect(window.open).toHaveBeenCalledWith(
      'https://maps.google.com/?cid=p1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('地圖載入失敗時，點擊清單項目不會報錯', async () => {
    mapsLoader.loadGoogleMaps.mockRejectedValue(new Error('load failed'))
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)
    navigator.geolocation.getCurrentPosition.mockImplementation((success) => {
      success({ coords: { latitude: DEFAULT_LOCATION.lat, longitude: DEFAULT_LOCATION.lng } })
    })

    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '使用目前位置' }))

    await screen.findByText('羅東夜市小吃')

    await user.click(screen.getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' }))

    const card = screen
      .getByRole('button', { name: '在地圖上顯示 羅東夜市小吃 的位置' })
      .closest('li')
    expect(card).toHaveClass('restaurant-card-selected')
  })
})

describe('App - 抽 5 家候選', () => {
  it('點擊「抽 5 家」只顯示抽出的 5 家候選', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(manyRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('候選店1')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('候選店2')).toBeInTheDocument()
    expect(screen.getByText('候選店6')).toBeInTheDocument()
    expect(screen.queryByText('候選店1')).not.toBeInTheDocument()
    expect(screen.queryByText('候選店7')).not.toBeInTheDocument()
    expect(screen.getByText('今天的候選（5 家）')).toBeInTheDocument()

    randomSpy.mockRestore()
  })

  it('抽 5 家後，地圖只顯示候選的 5 個標記（與清單一致）', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(manyRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('候選店1')
    await waitFor(() => expect(createdMarkers).toHaveLength(manyRestaurants.length))
    const baseline = createdMarkers.length

    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))

    await waitFor(() => expect(createdMarkers.length - baseline).toBe(5))
    const markerTitles = createdMarkers.slice(baseline).map((m) => m.options.title)
    expect(markerTitles).not.toContain('候選店1')
    expect(markerTitles).not.toContain('候選店7')
    expect(markerTitles).toContain('候選店2')
    expect(markerTitles).toContain('候選店6')

    randomSpy.mockRestore()
  })

  it('候選不足 5 家時顯示提示並顯示全部候選、不出錯', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(/目前這個分類只有 2 家/)).toBeInTheDocument()

    randomSpy.mockRestore()
  })

  it('「重新抽」會產生不同的候選組合', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(manyRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('候選店1')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))
    expect(screen.getByText('候選店2')).toBeInTheDocument()
    expect(screen.queryByText('候選店1')).not.toBeInTheDocument()

    randomSpy.mockReturnValue(0.99)
    await user.click(screen.getByRole('button', { name: '重新抽' }))

    expect(screen.getByText('候選店1')).toBeInTheDocument()
    expect(screen.queryByText('候選店6')).not.toBeInTheDocument()

    randomSpy.mockRestore()
  })

  it('「顯示全部」會還原完整清單並隱藏候選橫幅', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(manyRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('候選店1')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: '顯示全部' }))

    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.queryByText(/今天的候選/)).not.toBeInTheDocument()

    randomSpy.mockRestore()
  })

  it('切換分類篩選會自動清除候選狀態（回到完整清單，不會自動重新抽）', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))
    expect(screen.getByText(/今天的候選/)).toBeInTheDocument()

    api.fetchRestaurants.mockResolvedValueOnce([sampleRestaurants[1]])
    await user.selectOptions(screen.getByLabelText('分類篩選'), '台式')

    await waitFor(() => expect(screen.queryByText(/今天的候選/)).not.toBeInTheDocument())
    expect(screen.getByText('林場肉羹')).toBeInTheDocument()

    randomSpy.mockRestore()
  })

  it('換地點會把「抽 5 家」候選重置', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(manyRestaurants)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('候選店1')
    await user.click(screen.getByRole('button', { name: '抽 5 家 🎲' }))
    expect(screen.getByText(/今天的候選/)).toBeInTheDocument()

    const otherLocation = { lat: 25.03, lng: 121.56, label: '台北市信義區' }
    api.fetchRestaurants.mockResolvedValueOnce(manyRestaurants)
    await pickLocation(otherLocation)

    await waitFor(() => expect(screen.queryByText(/今天的候選/)).not.toBeInTheDocument())
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenLastCalledWith({
        category: undefined,
        sort: undefined,
        lat: otherLocation.lat,
        lng: otherLocation.lng,
        radius: 4000,
      }),
    )

    randomSpy.mockRestore()
  })
})

describe('App - 換地點後重置分類篩選', () => {
  it('新地點的分類清單沒有原本選的分類時，自動重置為全部分類並正常顯示新地點的餐廳', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.selectOptions(screen.getByLabelText('分類篩選'), '台式')
    expect(screen.getByLabelText('分類篩選')).toHaveValue('台式')

    const otherLocation = { lat: 25.03, lng: 121.56, label: '台北市信義區' }
    const otherRestaurants = [{ ...sampleRestaurants[0], placeId: 'o1', category: '咖啡廳' }]
    api.fetchCategories.mockResolvedValueOnce(['咖啡廳'])
    api.fetchRestaurants.mockResolvedValue(otherRestaurants)

    await pickLocation(otherLocation)

    await waitFor(() => expect(screen.getByLabelText('分類篩選')).toHaveValue(''))
    expect(screen.queryByText('找不到符合條件的餐廳。')).not.toBeInTheDocument()
    expect(screen.getByText(otherRestaurants[0].name)).toBeInTheDocument()
  })

  it('即使新地點分類清單還沒載入完成，換地點也會立刻重置分類篩選為全部', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.selectOptions(screen.getByLabelText('分類篩選'), '台式')
    expect(screen.getByLabelText('分類篩選')).toHaveValue('台式')

    let resolveCategories
    api.fetchCategories.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCategories = resolve
      }),
    )

    const otherLocation = { lat: 25.03, lng: 121.56, label: '台北市信義區' }
    await pickLocation(otherLocation)

    expect(screen.getByLabelText('分類篩選')).toHaveValue('')

    resolveCategories(sampleCategories)
    await waitFor(() => expect(screen.getByLabelText('分類篩選')).toHaveValue(''))
  })

  it('換到有同名分類的新地點時，換地點後清單會以全部分類重新查詢，不會沿用舊分類篩選', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)
    await pickLocation()

    await screen.findByText('羅東夜市小吃')
    await user.selectOptions(screen.getByLabelText('分類篩選'), '小吃')
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: '小吃' }),
      ),
    )

    const otherLocation = { lat: 25.03, lng: 121.56, label: '台北市信義區' }
    const otherRestaurants = [{ ...sampleRestaurants[1], placeId: 'o2', category: '台式' }]
    api.fetchCategories.mockResolvedValueOnce(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(otherRestaurants)

    await pickLocation(otherLocation)

    await waitFor(() => expect(screen.getByLabelText('分類篩選')).toHaveValue(''))
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenLastCalledWith(
        expect.objectContaining({ category: undefined }),
      ),
    )
    expect(screen.getByText(otherRestaurants[0].name)).toBeInTheDocument()
  })
})

describe('App - 地圖以所選地點為中心', () => {
  it('換地點時地圖會立刻以新地點重新定位，不用等餐廳清單載入完成', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    let resolveFetch
    api.fetchRestaurants.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve
      }),
    )

    render(<App />)
    await pickLocation()

    await waitFor(() => expect(createdMaps).toHaveLength(1))
    expect(createdMaps[0].options.center).toEqual({
      lat: DEFAULT_LOCATION.lat,
      lng: DEFAULT_LOCATION.lng,
    })

    const otherLocation = { lat: 25.03, lng: 121.56, label: '台北市信義區' }
    await pickLocation(otherLocation)

    await waitFor(() =>
      expect(createdMaps[0].setCenter).toHaveBeenCalledWith({
        lat: otherLocation.lat,
        lng: otherLocation.lng,
      }),
    )

    resolveFetch(sampleRestaurants)
  })
})

describe('App - 地點本地搜尋（不依賴 Google Places 自動完成）', () => {
  const luodong = taiwanDistricts.find((d) => d.label === '宜蘭縣羅東鎮')
  const xinyi = taiwanDistricts.find((d) => d.label === '台北市信義區')

  it('輸入鄉鎮片段會列出符合的本地下拉選項，且不受 Google 元件狀態影響', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '羅東')

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: '宜蘭縣羅東鎮' })).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('輸入縣市片段（例如「信義」）也能篩出對應的鄉鎮市區', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '信義')

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: '台北市信義區' })).toBeInTheDocument()
  })

  it('用滑鼠點選下拉選項會帶正確座標載入餐廳，並把選取結果顯示在輸入框', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '羅東鎮')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: '宜蘭縣羅東鎮' }))

    expect(input).toHaveValue('宜蘭縣羅東鎮')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({ lat: luodong.lat, lng: luodong.lng }),
      ),
    )
    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
  })

  it('用鍵盤（↓ 移動、Enter 選取）也能選到地點', async () => {
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '信義')
    const listbox = await screen.findByRole('listbox')

    const options = within(listbox).getAllByRole('option')
    const targetIndex = options.findIndex((option) => option.textContent === xinyi.label)
    expect(targetIndex).toBeGreaterThanOrEqual(0)
    // 開啟下拉時預設 highlight 第一筆（index 0），往下移動到目標選項再送出。
    for (let i = 0; i < targetIndex; i++) {
      await user.keyboard('{ArrowDown}')
    }
    await user.keyboard('{Enter}')

    expect(input).toHaveValue(xinyi.label)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.fetchRestaurants).toHaveBeenCalledWith(
        expect.objectContaining({ lat: xinyi.lat, lng: xinyi.lng }),
      ),
    )
  })

  it('按 Esc 會關閉下拉但保留目前輸入的文字', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '羅東')
    await screen.findByRole('listbox')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveValue('羅東')
  })

  it('Google 自動完成載入失敗（例如配額用盡）時，本地搜尋仍可正常選地點並載入餐廳清單', async () => {
    mapsLoader.loadGoogleMaps.mockRejectedValue(
      new Error('Quota exceeded for quota metric AutocompletePlacesRequest'),
    )
    api.fetchCategories.mockResolvedValue(sampleCategories)
    api.fetchRestaurants.mockResolvedValue(sampleRestaurants)

    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, '羅東鎮')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: '宜蘭縣羅東鎮' }))

    expect(await screen.findByText('羅東夜市小吃')).toBeInTheDocument()
    expect(screen.getByText(`附近餐廳推薦：${luodong.label}`)).toBeInTheDocument()
  })
})

describe('App - 地點本地搜尋（縣市＋鄉鎮連寫、全形臺、空白皆能篩出）', () => {
  const xitun = taiwanDistricts.find((d) => d.label === '台中市西屯區')
  const luodong = taiwanDistricts.find((d) => d.label === '宜蘭縣羅東鎮')
  const lingya = taiwanDistricts.find((d) => d.label === '高雄市苓雅區')
  const xinyi = taiwanDistricts.find((d) => d.label === '台北市信義區')
  const shilin = taiwanDistricts.find((d) => d.label === '台北市士林區')
  const qigu = taiwanDistricts.find((d) => d.label === '台南市七股區')

  it.each([
    ['台中西屯', xitun],
    ['臺中西屯', xitun],
    ['台中 西屯', xitun],
    ['宜蘭羅東', luodong],
    ['高雄苓雅', lingya],
    ['臺中市西屯', xitun],
    ['台中市西屯', xitun],
    ['臺北市信義', xinyi],
  ])('輸入「%s」會篩出「%s」', async (query, expected) => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')
    await user.type(input, query)

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: expected.label })).toBeInTheDocument()
  })

  it('只輸入全形「臺北市」「臺南市」也能篩出該縣市下的鄉鎮市區（官方寫法常見）', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')

    await user.type(input, '臺北市')
    let listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: shilin.label })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '臺南市')
    listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: qigu.label })).toBeInTheDocument()
  })

  it('「台中市西屯」與「臺中市西屯」（僅差臺/台異體字）篩出結果一致', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')

    await user.type(input, '台中市西屯')
    const simplifiedListbox = await screen.findByRole('listbox')
    expect(within(simplifiedListbox).getByRole('option', { name: xitun.label })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '臺中市西屯')
    const traditionalListbox = await screen.findByRole('listbox')
    expect(
      within(traditionalListbox).getByRole('option', { name: xitun.label }),
    ).toBeInTheDocument()
  })

  it('既有單一名稱查詢（羅東、西屯、信義區）不會因新增的比對而回歸', async () => {
    const user = userEvent.setup()
    render(<App />)

    const input = screen.getByLabelText('地點')

    await user.type(input, '羅東')
    let listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: luodong.label })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '西屯')
    listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: xitun.label })).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '信義區')
    listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByRole('option', { name: xinyi.label })).toBeInTheDocument()
  })
})
