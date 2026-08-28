export function positionToCartesian(
  latitude: number,
  longitude: number,
  radius: number,
) {
  const latitudeRadians = (latitude * Math.PI) / 180
  const longitudeRadians = (longitude * Math.PI) / 180
  return {
    x: radius * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    y: radius * Math.sin(latitudeRadians),
    z: -radius * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
  }
}
