import Fastify, { FastifyInstance } from 'fastify'
import sensible from '@fastify/sensible'
import { recipeRoutes } from './routes/recipes'

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  app.register(sensible)
  app.register(recipeRoutes, { prefix: '/me/recipes' })

  return app
}
