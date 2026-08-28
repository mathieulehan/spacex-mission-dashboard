import type {
  CelestrakRecord,
  Ll2Event,
  Ll2Launch,
  Ll2LaunchDetail,
} from './schemas.js'

const EARTH_RADIUS_KM = 6_378.137
const EARTH_GRAVITATIONAL_PARAMETER = 398_600.4418

export function normalizeLaunch(launch: Ll2Launch) {
  return {
    id: launch.id,
    sourceUrl: launch.url,
    name: launch.name,
    status: launch.status,
    lastUpdated: launch.last_updated,
    net: launch.net,
    windowStart: launch.window_start ?? launch.net,
    windowEnd: launch.window_end ?? launch.net,
    precision: launch.net_precision,
    probability: launch.probability ?? null,
    weatherConcerns: launch.weather_concerns ?? null,
    holdReason: launch.holdreason || null,
    failReason: launch.failreason || null,
    provider: launch.launch_service_provider.name,
    rocket: launch.rocket.configuration.full_name,
    rocketFamily: launch.rocket.configuration.family,
    missionName: launch.mission?.name ?? null,
    missionDescription: launch.mission?.description ?? null,
    missionType: launch.mission?.type ?? null,
    orbit: launch.mission?.orbit?.name ?? null,
    orbitAbbrev: launch.mission?.orbit?.abbrev ?? null,
    pad: launch.pad?.name ?? null,
    location: launch.pad?.location.name ?? null,
    latitude: toNumber(launch.pad?.latitude),
    longitude: toNumber(launch.pad?.longitude),
    webcastLive: launch.webcast_live,
    imageUrl: launch.image ?? null,
  }
}

export function normalizeEvent(event: Ll2Event) {
  return {
    id: event.id,
    sourceUrl: event.url,
    name: event.name,
    type: event.type.name,
    description: event.description ?? null,
    date: event.date,
    precision: event.date_precision.name,
    location: event.location ?? null,
    webcastLive: event.webcast_live,
    videoUrl: event.video_url ?? null,
    newsUrl: event.news_url ?? null,
    imageUrl: event.feature_image ?? null,
    lastUpdated: event.last_updated,
  }
}

export function normalizeLaunchDetail(launch: Ll2LaunchDetail) {
  const base = normalizeLaunch(launch)
  const configuration = launch.rocket.configuration
  return {
      ...base,
      flightClubUrl: launch.flightclub_url ?? null,
      rocketDetails: {
        description: configuration.description ?? null,
        reusable: configuration.reusable ?? null,
        lengthMeters: configuration.length ?? null,
        diameterMeters: configuration.diameter ?? null,
        launchCostUsd: configuration.launch_cost
          ? Number(configuration.launch_cost)
          : null,
        leoCapacityKg: configuration.leo_capacity ?? null,
        gtoCapacityKg: configuration.gto_capacity ?? null,
        launches: configuration.total_launch_count ?? null,
        successes: configuration.successful_launches ?? null,
        infoUrl: configuration.info_url ?? null,
        wikiUrl: configuration.wiki_url ?? null,
      },
      stages: launch.rocket.launcher_stage.map((stage) => ({
        type: stage.type,
        serialNumber: stage.launcher.serial_number,
        details: stage.launcher.details ?? null,
        reused: stage.reused ?? null,
        flightNumber: stage.launcher_flight_number ?? null,
        landing: stage.landing
          ? {
              attempted: stage.landing.attempt,
              description: stage.landing.description ?? null,
              type: stage.landing.type?.name ?? null,
              location: stage.landing.location?.name ?? null,
            }
          : null,
      })),
      padDetails: launch.pad
        ? {
            description: launch.pad.description ?? null,
            mapUrl: launch.pad.map_url ?? null,
            wikiUrl: launch.pad.wiki_url ?? null,
          }
        : null,
      links: launch.infoURLs.map((link) => ({
        title: link.title,
        description: link.description ?? null,
        url: link.url,
        source: link.source,
        type: link.type.name,
      })),
      videos: launch.vidURLs.map((link) => ({
        title: link.title,
        description: link.description ?? null,
        url: link.url,
        source: link.source,
        type: link.type.name,
        startsAt: link.start_time ?? null,
      })),
      timeline: launch.timeline.map((item) => ({
        label: item.type.abbrev,
        description: item.type.description,
        relativeTime: item.relative_time,
      })),
      updates: launch.updates.slice(0, 8).map((update) => ({
        comment: update.comment,
        url: update.info_url ?? null,
        createdAt: update.created_on,
      })),
  }
}

function toNumber(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function altitudeFromMeanMotion(meanMotion: number) {
  const radiansPerSecond = (meanMotion * 2 * Math.PI) / 86_400
  const semiMajorAxis = Math.cbrt(
    EARTH_GRAVITATIONAL_PARAMETER / radiansPerSecond ** 2,
  )
  return semiMajorAxis - EARTH_RADIUS_KM
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarizeStarlink(
  records: CelestrakRecord[],
  fetchedAt: string,
  stale: boolean,
  sampled = false,
) {
  const epochs = records
    .map((record) => Date.parse(record.EPOCH))
    .filter(Number.isFinite)
  const inclinations = records.map((record) => record.INCLINATION)
  const meanMotions = records.map((record) => record.MEAN_MOTION)
  const altitudes = meanMotions.map(altitudeFromMeanMotion)

  const inclinationBands = new Map<number, number>()
  for (const inclination of inclinations) {
    const band = Math.round(inclination)
    inclinationBands.set(band, (inclinationBands.get(band) ?? 0) + 1)
  }

  const stride = Math.max(1, Math.floor(records.length / 360))
  const plot = records
    .filter((_record, index) => index % stride === 0)
    .slice(0, 360)
    .map((record) => ({
      id: record.NORAD_CAT_ID,
      name: record.OBJECT_NAME,
      raan: record.RA_OF_ASC_NODE,
      inclination: record.INCLINATION,
      anomaly: record.MEAN_ANOMALY,
    }))

  const satellites = [...records]
    .sort((left, right) => Date.parse(right.EPOCH) - Date.parse(left.EPOCH))
    .slice(0, 12)
    .map((record) => ({
      name: record.OBJECT_NAME,
      objectId: record.OBJECT_ID,
      noradId: record.NORAD_CAT_ID,
      epoch: record.EPOCH,
      inclination: record.INCLINATION,
      eccentricity: record.ECCENTRICITY,
      periodMinutes: 1_440 / record.MEAN_MOTION,
      altitudeKm: altitudeFromMeanMotion(record.MEAN_MOTION),
    }))

  return {
    fetchedAt,
    stale,
    sampled,
    count: records.length,
    newestEpoch: epochs.length ? new Date(Math.max(...epochs)).toISOString() : null,
    averageInclination: average(inclinations),
    averageAltitudeKm: average(altitudes),
    averagePeriodMinutes: average(meanMotions.map((motion) => 1_440 / motion)),
    inclinationBands: [...inclinationBands.entries()]
      .map(([inclination, count]) => ({ inclination, count }))
      .sort((left, right) => left.inclination - right.inclination),
    plot,
    satellites,
  }
}
