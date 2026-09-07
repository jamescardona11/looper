import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { generate } from "../generate.mjs";
import {
  BRAND_MARK,
  PALETTE,
  PRODUCT_BOOT,
  neutralChroma,
  oklchToHex,
  oklchToRgb,
} from "../../../packages/ts/config/src/palette.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Relative luminance per WCAG 2.1. */
function luminance(hex) {
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  );
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("color tokens stay generated", () => {
  for (const { path, contents } of generate()) {
    test(`${path} matches the generator output`, () => {
      const committed = readFileSync(join(ROOT, path), "utf8");
      assert.equal(
        committed,
        contents,
        `${path} is stale — run: node tools/tokens/generate.mjs`,
      );
    });
  }
});

describe("palette guarantees", () => {
  test("every text role clears WCAG AA against its own background", () => {
    for (const mode of ["dark", "light"]) {
      const { neutrals } = PALETTE[mode];
      const background = oklchToHex(neutrals.bgPrimary);
      for (const role of ["textPrimary", "textSecondary", "textMuted"]) {
        const ratio = contrast(oklchToHex(neutrals[role]), background);
        assert.ok(ratio >= 4.5, `${mode}/${role} on ${background}`);
      }
    }
  });

  test("the accent is legible in both modes", () => {
    // #8f9cff sits at 2.3:1 on the light background, which is why the light
    // mode uses its own accent lightness instead of reusing the dark one.
    for (const mode of ["dark", "light"]) {
      const { neutrals, accent } = PALETTE[mode];
      const ratio = contrast(
        oklchToHex(accent.ink),
        oklchToHex(neutrals.bgPrimary),
      );
      assert.ok(ratio >= 4.5, `${mode} accent ink`);
    }
  });

  test("filled accent buttons carry legible label text", () => {
    for (const mode of ["dark", "light"]) {
      const { neutrals, accent } = PALETTE[mode];
      const solid = oklchToHex(accent.solid);
      // El acento oscuro es claro y admite tinta negra; el claro es oscuro y
      // admite blanca.
      const onSolid =
        mode === "dark" ? oklchToHex(neutrals.bgPrimary) : "#ffffff";
      assert.ok(contrast(onSolid, solid) >= 4.5, `${mode} on-accent`);
    }
  });

  test("background steps stay far enough apart to read as distinct", () => {
    // The previous ramp packed five surfaces into ten lightness points, so
    // bg-secondary and bg-tertiary were indistinguishable at 1.05:1 and
    // 1.11:1 against the page.
    //
    // The floors differ by mode on purpose. Dark mode spreads its surfaces
    // across 0.18-0.44, so every step can be a comfortable 4-5 points. Light
    // mode runs into the 1.0 ceiling with only ~2 points between the page and
    // white, and leans on borders and shadows for elevation instead.
    //
    // `bgOverlay` is deliberately excluded: in light mode a floating overlay
    // sits on white like the surface below it and is separated by its shadow,
    // so the two share a lightness by design.
    const FLOOR = { dark: 0.03, light: 0.005 };
    const order = ["bgPrimary", "bgSecondary", "bgTertiary", "bgSurface"];
    for (const mode of ["dark", "light"]) {
      const { neutrals } = PALETTE[mode];
      for (let i = 1; i < order.length; i += 1) {
        const step = Math.abs(
          neutrals[order[i]].l - neutrals[order[i - 1]].l,
        );
        assert.ok(
          step >= FLOOR[mode],
          `${mode} ${order[i - 1]} → ${order[i]} = ${step.toFixed(3)}`,
        );
      }
    }
  });

  test("neutrals share one hue and go untinted at the extremes", () => {
    for (const mode of ["dark", "light"]) {
      const values = Object.values(PALETTE[mode].neutrals);
      const hues = new Set(values.map((v) => v.h));
      assert.equal(hues.size, 1, `${mode} neutral hues`);
      for (const value of values) {
        assert.ok(Math.abs(value.c - neutralChroma(value.l)) < 1e-9);
      }
    }
  });

  test("speaker colors never collide with the accent or with each other", () => {
    // speaker-1 used to sit at ΔE 3.2 from the accent, so "who is talking"
    // read the same as "active state". They are neutral greys now, which keeps
    // the accent meaning "active" and nothing else.
    const oklab = (hex) => {
      const [r, g, b] = [0, 2, 4].map((offset) => {
        const v = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
      ];
    };
    const deltaE = (a, b) =>
      Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i])) * 100;

    const speakers = PALETTE.dark.speakers.map(oklchToHex);
    const accent = oklchToHex(PALETTE.dark.accent.base);
    for (const [index, speaker] of speakers.entries()) {
      assert.ok(
        deltaE(speaker, accent) > 12,
        `speaker-${index + 1} vs accent`,
      );
    }
    for (let i = 0; i < speakers.length; i += 1) {
      for (let j = i + 1; j < speakers.length; j += 1) {
        assert.ok(
          deltaE(speakers[i], speakers[j]) > 8,
          `speaker-${i + 1} vs speaker-${j + 1}`,
        );
      }
    }
  });
});

describe("native config mirrors the palette", () => {
  // These are not CSS and the generator does not rewrite them, but they carry
  // brand colors that used to go stale silently: the Tauri window background
  // and the iOS widget colors were still on the pre-2026 ramp long after the
  // tokens moved.
  const cases = [
    {
      file: "apps/desktop/src-tauri/tauri.conf.json",
      label: "Tauri window background",
      expected: () => PRODUCT_BOOT.desktopSettingsBackground,
    },
    {
      file: "apps/mobile/targets/widgets/expo-target.config.js",
      label: "iOS widget background",
      expected: () => oklchToHex(PALETTE.dark.neutrals.bgPrimary),
    },
    {
      file: "apps/mobile/targets/widgets/expo-target.config.js",
      label: "iOS widget accent",
      expected: () => oklchToHex(PALETTE.dark.accent.base),
    },
  ];

  for (const { file, label, expected } of cases) {
    test(`${label} uses the current palette`, () => {
      const contents = readFileSync(join(ROOT, file), "utf8").toLowerCase();
      const value = expected().toLowerCase();
      assert.ok(
        contents.includes(value),
        `${file} should reference ${value} for ${label}`,
      );
    });
  }
});

describe("the iOS keyboard extension mirrors the palette", () => {
  // KeyboardViewController.swift carries a fourth copy of the ramp as UIColor
  // float triplets — Swift cannot read the CSS tokens or the TS map. It had
  // silently kept the pre-2026 values. These assertions are the only thing
  // stopping it from drifting again.
  const swift = () =>
    readFileSync(
      join(ROOT, "apps/mobile/targets/keyboard/KeyboardViewController.swift"),
      "utf8",
    );

  const floats = (color) => {
    const channels =
      typeof color === "string"
        ? [0, 2, 4].map((offset) =>
            Number.parseInt(color.slice(1 + offset, 3 + offset), 16),
          )
        : oklchToRgb(color);
    return channels.map((channel) => (channel / 255).toFixed(3));
  };

  const roles = [
    ["background", () => PALETTE.dark.neutrals.bgPrimary],
    [
      "backgroundSecondary",
      () => PRODUCT_BOOT.mobileKeyboard.backgroundSecondary,
    ],
    ["surfaceMuted", () => PALETTE.dark.neutrals.bgTertiary],
    ["surface", () => PALETTE.dark.neutrals.bgSurface],
    ["surfaceElevated", () => PALETTE.dark.neutrals.bgElevated],
    ["border", () => PALETTE.dark.neutrals.borderPrimary],
    ["text", () => PALETTE.dark.neutrals.textPrimary],
    ["textSecondary", () => PALETTE.dark.neutrals.textSecondary],
    ["muted", () => PALETTE.dark.neutrals.textMuted],
    ["accent", () => PRODUCT_BOOT.mobileKeyboard.accent],
  ];

  for (const [role, resolve] of roles) {
    test(`Palette.${role} matches the shared ramp`, () => {
      const declared = new RegExp(
        `static let ${role} = UIColor\\(red: ([\\d.]+), green: ([\\d.]+), blue: ([\\d.]+)`,
      ).exec(swift());
      assert.ok(declared, `Palette.${role} is missing from the Swift palette`);

      // Compared numerically: Swift writes 1 where the generator writes 1.000,
      // and both are the same color.
      const expected = floats(resolve()).map(Number);
      const actual = declared.slice(1, 4).map(Number);
      for (const [index, channel] of expected.entries()) {
        assert.ok(
          Math.abs(channel - actual[index]) < 0.001,
          `Palette.${role} should be UIColor(red: ${expected.join(", ")}) but is (${actual.join(", ")})`,
        );
      }
    });
  }
});

describe("the web boot splash mirrors the palette", () => {
  // index.html paints before the stylesheet exists, so it cannot read tokens
  // and has to inline the light-only Web boot palette.
  const html = () => readFileSync(join(ROOT, "apps/web/index.html"), "utf8");

  const roles = [
    ["page", () => PRODUCT_BOOT.web.page],
    ["ink", () => PRODUCT_BOOT.web.ink],
    ["muted text", () => PRODUCT_BOOT.web.muted],
    ["icon border", () => PRODUCT_BOOT.web.iconBorder],
    ["icon surface", () => PRODUCT_BOOT.web.iconSurface],
    ["accent", () => PRODUCT_BOOT.web.accent],
    ["browser theme", () => PRODUCT_BOOT.web.theme],
  ];

  for (const [label, resolve] of roles) {
    test(`${label} uses the current palette`, () => {
      const value = resolve();
      assert.ok(
        html().toLowerCase().includes(value),
        `index.html should reference ${value} for ${label}`,
      );
    });
  }

  test("no color from the old warm splash survives", () => {
    const retired = [
      // la paleta terracota original
      "#f8f5f2", "#241b18", "#ded7d2", "#b14b25", "#0e0806", "#160d0a",
      // y el intento intermedio de neutros teñidos con el tono de marca
      "#f2f2f4", "#202128", "#dfdfe3", "#5a62cb", "#101116", "#1a1b21",
    ];
    const contents = html().toLowerCase();
    for (const color of retired) {
      assert.ok(!contents.includes(color), `${color} should be gone`);
    }
  });
});

describe("the Expo shell mirrors the brand mark", () => {
  // Without these, expo prebuild falls back to its own defaults — a white
  // splash and #023c69 as colorPrimary — which is how the Android icon ended
  // up on a background nobody chose.
  test("app.config.ts uses the brand paper for splash and adaptive icon", () => {
    const config = readFileSync(
      join(ROOT, "apps/mobile/app.config.ts"),
      "utf8",
    ).toLowerCase();
    const occurrences = config.split(BRAND_MARK.paper.toLowerCase()).length - 1;
    assert.ok(
      occurrences >= 2,
      `app.config.ts should use ${BRAND_MARK.paper} for both the splash and the adaptive icon`,
    );
  });
});

describe("the Android keyboard mirrors the palette", () => {
  // LooperIME.kt is the fifth copy of the accent — Kotlin can read neither the
  // CSS tokens nor the TS map, so it hardcodes an ARGB literal. It kept
  // #8f9cff for a whole round after the accent moved, which is exactly the kind
  // of drift this file exists to catch.
  test("COLOR_ACCENT matches the shared accent", () => {
    const kotlin = readFileSync(
      join(ROOT, "apps/mobile/native/android/com/j11/looper/mobile/LooperIME.kt"),
      "utf8",
    );
    const expected = oklchToHex(PALETTE.dark.accent.base).slice(1).toUpperCase();
    assert.ok(
      kotlin.includes(`0xFF${expected}.toInt()`),
      `COLOR_ACCENT should be 0xFF${expected}.toInt()`,
    );
  });
});
