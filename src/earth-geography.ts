import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import worldData from 'world-atlas/countries-110m.json'

export type Coordinate = [longitude: number, latitude: number]
export type GeographicPolygon = Coordinate[][]

const topology = worldData as unknown as Topology<{
  countries: GeometryCollection
}>
const countries = feature(topology, topology.objects.countries)

export const WORLD_POLYGONS: GeographicPolygon[] =
  countries.type === 'FeatureCollection'
    ? countries.features.flatMap((country) => {
        if (!country.geometry) return []
        if (country.geometry.type === 'Polygon') {
          return [country.geometry.coordinates as GeographicPolygon]
        }
        if (country.geometry.type === 'MultiPolygon') {
          return country.geometry.coordinates as GeographicPolygon[]
        }
        return []
      })
    : []
