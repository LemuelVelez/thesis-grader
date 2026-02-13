/**
 * Email theme tokens aligned with app/globals.css (Spring Green theme).
 * Email clients don't reliably support CSS variables, so values are inlined.
 */
export interface EmailTheme {
    background: string
    foreground: string
    card: string
    mutedForeground: string
    border: string
    primary: string
    primaryForeground: string
    secondary: string
    accent: string
}

export const thesisgraderEmailTheme: EmailTheme = {
    background: "#f4fff8",
    foreground: "#0b1f15",
    card: "#ffffff",
    mutedForeground: "#2d5b44",
    border: "#d2f5e2",
    primary: "#00ff7f",
    primaryForeground: "#052013",
    secondary: "#d6ffe9",
    accent: "#b8ffda",
}

export const emailFontFamily =
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
