
import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined,
)

interface ThemeProviderProps {
  children: ReactNode
}

function getInitialTheme(): Theme {
  const savedTheme = localStorage.getItem('cyberfusion-theme')

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  return 'dark'
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('cyberfusion-theme', theme)
  }, [theme])

  function toggleTheme() {
    setTheme((currentTheme) =>
      currentTheme === 'dark' ? 'light' : 'dark',
    )
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
