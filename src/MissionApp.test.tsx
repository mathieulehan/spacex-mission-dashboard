import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { missionApi } from './api'
import MissionApp from './MissionApp'
import {
  eventsFixture,
  launchDetailFixture,
  launchesFixture,
  starlinkFixture,
} from './test/fixtures'

vi.mock('./api', () => ({
  missionApi: {
    launches: vi.fn(),
    launch: vi.fn(),
    events: vi.fn(),
    starlink: vi.fn(),
  },
}))

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MissionApp />
    </QueryClientProvider>,
  )
}

describe('MissionApp', () => {
  beforeEach(() => {
    vi.mocked(missionApi.launches).mockResolvedValue(launchesFixture)
    vi.mocked(missionApi.launch).mockResolvedValue(launchDetailFixture)
    vi.mocked(missionApi.events).mockResolvedValue(eventsFixture)
    vi.mocked(missionApi.starlink).mockResolvedValue(starlinkFixture)
  })

  afterEach(cleanup)

  it('renders LL2 missions and CelesTrak orbital data', async () => {
    renderApp()

    expect(
      await screen.findByRole('heading', {
        name: 'Roman Space Telescope',
        level: 1,
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Starship Booster Static Fire' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Watch/ })).toBeVisible()
    expect(screen.getByRole('link', { name: /Details/ })).toBeVisible()
    expect(await screen.findByText('8,100')).toBeInTheDocument()
    expect(screen.getByText('STARLINK-1008')).toBeInTheDocument()
  })

  it('isolates a CelesTrak outage from launch data', async () => {
    vi.mocked(missionApi.starlink).mockRejectedValue(
      new Error('CelesTrak rate limit active'),
    )
    renderApp()

    expect(
      await screen.findByText('CelesTrak rate limit active', undefined, {
        timeout: 3_000,
      }),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', {
        name: 'Roman Space Telescope',
        level: 1,
      }),
    ).toBeInTheDocument()
  })

  it('labels limited stale orbital data without presenting it as complete', async () => {
    vi.mocked(missionApi.starlink).mockResolvedValue({
      ...starlinkFixture,
      stale: true,
      sampled: true,
      count: 6,
    })
    renderApp()

    expect(
      await screen.findByText('Limited bootstrap sample'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Metrics below describe only this sample/),
    ).toBeInTheDocument()
  })

  it('opens rich mission details inside the app', async () => {
    const user = userEvent.setup()
    renderApp()

    await user.click(await screen.findByRole('button', { name: /Mission details/ }))

    expect(
      await screen.findByRole('dialog', { name: 'Roman Space Telescope' }),
    ).toBeInTheDocument()
    expect(screen.getByText('B1072')).toBeInTheDocument()
    expect(screen.getByText('Official webcast')).toBeInTheDocument()
    expect(screen.getByText('Liftoff')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close mission details' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps known mission data visible when detail enrichment fails', async () => {
    const user = userEvent.setup()
    vi.mocked(missionApi.launch).mockRejectedValue(new Error('LL2 rate limited'))
    renderApp()

    await user.click(await screen.findByRole('button', { name: /Mission details/ }))

    expect(
      await screen.findByText('Extended details are temporarily unavailable', undefined, {
        timeout: 3_000,
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('60% favorable')).toHaveLength(2)
    expect(screen.getByText('Launch Complex 39A')).toBeInTheDocument()
  })
})
