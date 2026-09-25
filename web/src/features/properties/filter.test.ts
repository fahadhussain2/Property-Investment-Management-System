import { describe, expect, it } from 'vitest'
import { filterProperties, statusCounts, type FilterableProperty } from './filter'

const p = (code: string, status: FilterableProperty['status'], extra: Partial<FilterableProperty> = {}): FilterableProperty => ({
  code,
  name: null,
  kind: 'house',
  status,
  for_sale: false,
  ...extra,
})

const rows = [
  p('DP-25', 'rented', { for_sale: true, name: 'Defence Phase 5' }),
  p('SHOP-4', 'rented', { kind: 'shop' }),
  p('PLOT-7', 'vacant', { kind: 'plot', for_sale: true }),
  p('H-1', 'sold', { for_sale: true }),
  p('APT-2', 'under_agreement', { kind: 'apartment' }),
]

describe('property register filters', () => {
  it('filters by status', () => {
    expect(filterProperties(rows, { status: 'rented' }).map((r) => r.code)).toEqual(['DP-25', 'SHOP-4'])
    expect(filterProperties(rows, { status: 'vacant' }).map((r) => r.code)).toEqual(['PLOT-7'])
  })

  it('"for sale" includes rented properties but never sold ones', () => {
    expect(filterProperties(rows, { status: 'for_sale' }).map((r) => r.code)).toEqual(['DP-25', 'PLOT-7'])
  })

  it('combines kind and search (code or name, case-insensitive)', () => {
    expect(filterProperties(rows, { kind: 'shop' }).map((r) => r.code)).toEqual(['SHOP-4'])
    expect(filterProperties(rows, { q: 'defence' }).map((r) => r.code)).toEqual(['DP-25'])
    expect(filterProperties(rows, { q: 'plot', status: 'sold' })).toEqual([])
  })

  it('counts every status chip', () => {
    expect(statusCounts(rows)).toEqual({ all: 5, vacant: 1, rented: 2, for_sale: 2, under_agreement: 1, sold: 1 })
  })
})
