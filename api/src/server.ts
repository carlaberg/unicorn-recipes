import { buildApp } from './app'

const app = buildApp()

const start = async () => {
  try {
    const port = parseInt(process.env.PORT ?? '3000', 10)
    await app.listen({ port, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
