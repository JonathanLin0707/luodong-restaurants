import RestaurantCard from './RestaurantCard.jsx'

export default function RestaurantList({ restaurants, selectedPlaceId, onSelect, onOpenMaps }) {
  return (
    <ul className="restaurant-list">
      {restaurants.map((restaurant) => (
        <RestaurantCard
          key={restaurant.placeId}
          restaurant={restaurant}
          isSelected={restaurant.placeId === selectedPlaceId}
          onSelect={onSelect}
          onOpenMaps={onOpenMaps}
        />
      ))}
    </ul>
  )
}
