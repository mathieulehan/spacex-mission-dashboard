import { z } from 'zod'

const nullableString = z.string().nullable().optional()
const nullableNumber = z.number().nullable().optional()

const statusSchema = z.object({
  name: z.string(),
  abbrev: z.string(),
  description: z.string(),
})

const precisionSchema = z.object({
  name: z.string(),
  abbrev: z.string(),
  description: z.string(),
})

export const ll2LaunchSchema = z.object({
  id: z.string(),
  url: z.string(),
  name: z.string(),
  status: statusSchema,
  last_updated: z.string(),
  net: z.string(),
  window_start: z.string().nullable(),
  window_end: z.string().nullable(),
  net_precision: precisionSchema,
  probability: nullableNumber,
  weather_concerns: nullableString,
  holdreason: z.string().optional().default(''),
  failreason: z.string().optional().default(''),
  launch_service_provider: z.object({ name: z.string() }),
  rocket: z.object({
    configuration: z.object({
      family: z.string(),
      full_name: z.string(),
      variant: z.string(),
    }),
  }),
  mission: z
    .object({
      name: z.string(),
      description: nullableString,
      type: nullableString,
      orbit: z
        .object({
          name: z.string(),
          abbrev: z.string(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
  pad: z
    .object({
      name: z.string(),
      latitude: nullableString,
      longitude: nullableString,
      location: z.object({
        name: z.string(),
        timezone_name: z.string(),
      }),
    })
    .nullable()
    .optional(),
  webcast_live: z.boolean(),
  image: nullableString,
})

export const ll2LaunchesSchema = z.object({
  count: z.number(),
  results: z.array(ll2LaunchSchema),
})

const mediaLinkSchema = z.object({
  title: z.string(),
  description: nullableString,
  url: z.string(),
  source: z.string(),
  type: z.object({ name: z.string() }),
  start_time: nullableString,
})

export const ll2LaunchDetailSchema = ll2LaunchSchema.extend({
  flightclub_url: nullableString,
  updates: z
    .array(
      z.object({
        comment: z.string(),
        info_url: nullableString,
        created_on: z.string(),
      }),
    )
    .optional()
    .default([]),
  rocket: z.object({
    configuration: z.object({
      family: z.string(),
      full_name: z.string(),
      variant: z.string(),
      description: nullableString,
      reusable: z.boolean().optional(),
      length: nullableNumber,
      diameter: nullableNumber,
      launch_cost: nullableString,
      leo_capacity: nullableNumber,
      gto_capacity: nullableNumber,
      total_launch_count: nullableNumber,
      successful_launches: nullableNumber,
      info_url: nullableString,
      wiki_url: nullableString,
    }),
    launcher_stage: z
      .array(
        z.object({
          type: z.string(),
          reused: z.boolean().nullable().optional(),
          launcher_flight_number: nullableNumber,
          launcher: z.object({
            serial_number: z.string(),
            details: nullableString,
          }),
          landing: z
            .object({
              attempt: z.boolean(),
              description: nullableString,
              type: z.object({ name: z.string(), abbrev: z.string() }).nullable(),
              location: z.object({ name: z.string() }).nullable(),
            })
            .nullable()
            .optional(),
        }),
      )
      .optional()
      .default([]),
  }),
  pad: z
    .object({
      name: z.string(),
      description: nullableString,
      wiki_url: nullableString,
      map_url: nullableString,
      latitude: nullableString,
      longitude: nullableString,
      location: z.object({
        name: z.string(),
        timezone_name: z.string(),
      }),
    })
    .nullable()
    .optional(),
  infoURLs: z.array(mediaLinkSchema).optional().default([]),
  vidURLs: z.array(mediaLinkSchema).optional().default([]),
  timeline: z
    .array(
      z.object({
        type: z.object({
          abbrev: z.string(),
          description: z.string(),
        }),
        relative_time: z.string(),
      }),
    )
    .optional()
    .default([]),
})

export const ll2EventSchema = z.object({
  id: z.number(),
  url: z.string(),
  name: z.string(),
  last_updated: z.string(),
  type: z.object({ name: z.string() }),
  description: nullableString,
  webcast_live: z.boolean(),
  location: nullableString,
  news_url: nullableString,
  video_url: nullableString,
  feature_image: nullableString,
  date: z.string(),
  date_precision: precisionSchema,
})

export const ll2EventsSchema = z.object({
  count: z.number(),
  results: z.array(ll2EventSchema),
})

// CCSDS OMM-standard general perturbations fields, shared by CelesTrak and
// Space-Track's GP API classes.
export const gpRecordSchema = z.object({
  OBJECT_NAME: z.string(),
  OBJECT_ID: z.string(),
  EPOCH: z.string(),
  // Space-Track's GP API returns numeric fields as strings (unlike
  // CelesTrak's plain JSON numbers), so these are coerced to numbers.
  MEAN_MOTION: z.coerce.number(),
  ECCENTRICITY: z.coerce.number(),
  INCLINATION: z.coerce.number(),
  RA_OF_ASC_NODE: z.coerce.number(),
  ARG_OF_PERICENTER: z.coerce.number(),
  MEAN_ANOMALY: z.coerce.number(),
  NORAD_CAT_ID: z.coerce.number(),
  REV_AT_EPOCH: z.coerce.number(),
  BSTAR: z.coerce.number(),
})

export const gpRecordsSchema = z.array(gpRecordSchema).min(1)

export type Ll2Launch = z.infer<typeof ll2LaunchSchema>
export type Ll2LaunchDetail = z.infer<typeof ll2LaunchDetailSchema>
export type Ll2Event = z.infer<typeof ll2EventSchema>
export type GpRecord = z.infer<typeof gpRecordSchema>
