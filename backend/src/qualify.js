const MIN_RATING = 3.0;
function isQualifiedRestaurant(r){return Number.isFinite(r.rating)&&r.rating>=MIN_RATING;}
module.exports={MIN_RATING,isQualifiedRestaurant};
