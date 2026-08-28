import 'dotenv/config'
import { createApp } from './app.js'

const port = Number(process.env.PORT ?? 8787)
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535')
}

const app = createApp({ serveStatic: process.env.NODE_ENV === 'production' })
app.listen(port, () => {
  console.log(`SpaceX dashboard API listening on http://localhost:${port}`)
})
