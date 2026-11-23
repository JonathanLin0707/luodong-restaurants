import { MAX_RADIUS_METERS, MIN_RADIUS_METERS } from '../urlState.js'

const STEP = 100

export default function RadiusControl({ radius, onChange }) {
  return (
    <div className='radius-control'>
      <label htmlFor='radius-range'>搜尋半徑</label>
      <input
        id='radius-range'
        type='range'
        min={MIN_RADIUS_METERS}
        max={MAX_RADIUS_METERS}
        step={STEP}
        value={radius}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label='搜尋半徑'
      />
      <span className='radius-value'>
        {radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}
      </span>
    </div>
  )
}
