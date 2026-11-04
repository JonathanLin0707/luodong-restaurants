// 產生 frontend/src/data/taiwan-districts.json：全台 22 縣市、368 鄉鎮市區，
// 每筆含該鄉鎮市區中心點座標（誤差 1 公里內可接受，用於地點選擇器的本地搜尋）。
//
// 資料來源：taiwan-atlas（MIT License，https://github.com/dkaoster/taiwan-atlas），
// 其 towns-10t.json 是 TopoJSON，整理自中華民國內政部「鄉鎮市區界線(TWD97經緯度)」
// 開放資料（https://data.gov.tw/dataset/7441，政府資料開放授權條款）。
// 本腳本只讀取 CDN 上的 JSON 做一次性轉換，不安裝任何套件、不改動專案相依套件。
//
// 用法：node scripts/build-districts.mjs

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://cdn.jsdelivr.net/npm/taiwan-atlas/towns-10t.json'
const OUTPUT_PATH = fileURLToPath(
  new URL('../frontend/src/data/taiwan-districts.json', import.meta.url),
)

// --- 最小化 TopoJSON 解碼（不依賴 topojson-client） ---

function decodeArc(rawArc, scale, translate) {
  let x = 0
  let y = 0
  const points = []
  for (const [dx, dy] of rawArc) {
    x += dx
    y += dy
    points.push([x * scale[0] + translate[0], y * scale[1] + translate[1]])
  }
  return points
}

function resolveArc(arcIndex, decodedArcs) {
  if (arcIndex >= 0) return decodedArcs[arcIndex]
  // 負索引代表方向相反的共用弧線：-index - 1 取原弧，再反轉。
  return [...decodedArcs[~arcIndex]].reverse()
}

function buildRing(arcIndexes, decodedArcs) {
  const points = []
  for (const arcIndex of arcIndexes) {
    const arcPoints = resolveArc(arcIndex, decodedArcs)
    if (points.length > 0 && arcPoints.length > 0) {
      const last = points[points.length - 1]
      // 相鄰弧線共用端點，避免重複點造成面積計算略微失真。
      if (last[0] === arcPoints[0][0] && last[1] === arcPoints[0][1]) {
        points.push(...arcPoints.slice(1))
        continue
      }
    }
    points.push(...arcPoints)
  }
  return points
}

// 多邊形（僅用外環）面積與質心，公式見 https://en.wikipedia.org/wiki/Centroid#Of_a_polygon
function ringAreaAndCentroid(ring) {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i]
    const [x1, y1] = ring[i + 1]
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area /= 2
  if (area === 0) {
    const fallback = ring[0] ?? [0, 0]
    return { area: 0, lng: fallback[0], lat: fallback[1] }
  }
  cx /= 6 * area
  cy /= 6 * area
  return { area: Math.abs(area), lng: cx, lat: cy }
}

// 外環永遠是每個 polygon 的第一環；內環（島中湖、海岸切割）對 1 公里誤差內的
// 代表點影響可忽略，故質心只用外環計算。多島鄉鎮（MultiPolygon）取面積最大
// 的那塊陸地的質心，避免落在島與島之間的海面上。
function geometryCentroid(geometry, decodedArcs) {
  const polygons = geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs
  let best = null
  for (const rings of polygons) {
    const outerRing = buildRing(rings[0], decodedArcs)
    const candidate = ringAreaAndCentroid(outerRing)
    if (!best || candidate.area > best.area) best = candidate
  }
  return { lat: best.lat, lng: best.lng }
}

async function main() {
  const res = await fetch(SOURCE_URL)
  if (!res.ok) {
    throw new Error(`下載 ${SOURCE_URL} 失敗：HTTP ${res.status}`)
  }
  const topology = await res.json()
  const { scale, translate } = topology.transform
  const decodedArcs = topology.arcs.map((arc) => decodeArc(arc, scale, translate))

  const towns = topology.objects.towns.geometries
  const districts = towns
    .map((town) => {
      const { lat, lng } = geometryCentroid(town, decodedArcs)
      const county = town.properties.COUNTYNAME
      const district = town.properties.TOWNNAME
      return {
        county,
        district,
        label: `${county}${district}`,
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant'))

  if (districts.length !== 368) {
    throw new Error(`預期 368 筆鄉鎮市區，實際取得 ${districts.length} 筆，請確認資料來源`)
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify(districts, null, 2)}\n`, 'utf-8')
  console.log(`已寫入 ${districts.length} 筆鄉鎮市區中心點座標至 ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
