const token = (name) => `var(--color-${name})`;

const scale = (name, variants) =>
  Object.fromEntries(
    variants.map((variant) => [
      variant === "DEFAULT" ? variant : String(variant),
      token(variant === "DEFAULT" ? name : `${name}-${variant}`),
    ]),
  );

/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      zIndex: {
        "dropdown-open": "20",
        tooltip: "30",
      },
      colors: {
        cloud: scale("cloud", [
          "DEFAULT",
          "light",
          "dark",
          "hover",
          5,
          10,
          20,
          30,
          50,
          80,
        ]),
        local: scale("local", [
          "DEFAULT",
          "light",
          "dark",
          "hover",
          5,
          10,
          15,
          20,
          30,
          40,
          50,
          60,
          80,
        ]),
        accent: scale("accent", [
          "DEFAULT",
          "light",
          "dark",
          "hover",
          5,
          10,
          20,
          30,
          50,
          80,
        ]),
        surface: {
          primary: token("bg-primary"),
          secondary: token("bg-secondary"),
          tertiary: token("bg-tertiary"),
          surface: token("bg-surface"),
          overlay: token("bg-overlay"),
          elevated: token("bg-elevated"),
          "elevated-hover": token("bg-elevated-hover"),
          hover: token("bg-hover"),
        },
        border: {
          primary: token("border-primary"),
          secondary: token("border-secondary"),
          hover: token("border-hover"),
        },
        content: {
          primary: token("text-primary"),
          secondary: token("text-secondary"),
          muted: token("text-muted"),
          disabled: token("text-disabled"),
        },
        success: token("success"),
        error: token("error"),
        warning: token("warning"),
        info: token("info"),
        // Alias del acento; existe por compatibilidad con el código que lo usa.
        "accent-ink": token("accent-ink"),
      },
    },
  },
  plugins: [],
};
