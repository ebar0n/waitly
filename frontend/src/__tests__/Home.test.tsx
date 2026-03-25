import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Home from '../../app/routes/home'

describe('Home', () => {
  it('renders email input with aria-label', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    const input = screen.getByLabelText('Correo electrónico')
    expect(input).toBeInTheDocument()
  })

  it('renders submit button with correct text', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )
    const button = screen.getByRole('button', { name: 'Unirme a la lista' })
    expect(button).toBeInTheDocument()
  })
})
