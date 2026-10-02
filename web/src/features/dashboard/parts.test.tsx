import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { QueryLike } from './model'
import { useAnimateIn } from './motion'
import { Loaded, Skeleton } from './parts'

const q = (over: Partial<QueryLike<string>>): QueryLike<string> => ({
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
  refetch: () => undefined,
  ...over,
})

function Body({ text }: { text: string }) {
  return <span data-testid="body" data-animate-in={String(useAnimateIn())}>{text}</span>
}

const view = (query: QueryLike<string>) => (
  <Loaded query={query} skeleton={<Skeleton className="h-4" />}>
    {(d) => <Body text={d} />}
  </Loaded>
)

afterEach(cleanup)

// Spec 005 §5: motion only when content replaces a skeleton.
describe('Loaded entrance', () => {
  it('animates content that replaces the skeleton, and tells its children', () => {
    const { rerender } = render(view(q({ isPending: true })))
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    rerender(view(q({ data: 'Rs 1' })))
    const body = screen.getByTestId('body')
    expect(body.parentElement).toHaveClass('motion-safe:animate-dash-in')
    expect(body).toHaveAttribute('data-animate-in', 'true')
  })

  it('does not animate content that was already loaded when it mounted', () => {
    render(view(q({ data: 'Rs 1' })))
    const body = screen.getByTestId('body')
    expect(body.parentElement).not.toHaveClass('motion-safe:animate-dash-in')
    expect(body).toHaveAttribute('data-animate-in', 'false')
  })

  it('shows the error, not animated content, when loading fails', () => {
    const { rerender } = render(view(q({ isPending: true })))
    rerender(view(q({ isError: true, error: new Error('boom') })))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('body')).toBeNull()
  })
})
