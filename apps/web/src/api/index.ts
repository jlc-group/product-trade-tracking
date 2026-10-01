// Single entry point for data access: pages and hooks use `api` (the FlowTrade REST API, apps/api).
import { httpApi } from './http/http-api'

export type { Api } from './http/http-api'
export const api = httpApi

export * from './types'
