import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Este fichero sólo cubre invariantes transversales que ningún render aislado
// puede comprobar: barridos de motion y de accesibilidad sobre el conjunto de
// superficies rediseñadas. Nunca debe afirmar la forma textual del código (la
// firma de un ternario, una cadena exacta de clases Tailwind) ni leer un
// wrapper de reexport que no contiene la lógica que dice vigilar.

const SRC = resolve(import.meta.dirname, "../../src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

// Ficheros donde vive el marcado real de cada superficie rediseñada. Los
// wrappers que sólo delegan (Home.tsx, LibraryView.tsx) no contienen una sola
// clase: leerlos hace que el barrido no pueda fallar.
const REDESIGNED_INTERACTION_FILES = [
  "home-presentation.tsx",
  "features/library/components/library-view-content.tsx",
  "features/library/components/library-view-list.tsx",
  "features/library/components/library-view-toolbar.tsx",
  "features/library/components/library-view-overlays.tsx",
  "features/library/components/LibraryCard.tsx",
  "features/library/components/library-card-body.tsx",
  "features/library/components/library-card-actions.tsx",
  "features/library/components/LibraryPlayerFooter.tsx",
  "features/settings/components/SettingsRoute.tsx",
  "features/settings/components/tabs/GeneralTab.tsx",
  "features/transcriptions/components/HomeAskBar.tsx",
  "features/transcriptions/components/TranscriptionList.tsx",
  "features/voice/components/VoiceView.tsx",
] as const;

// Superficies persistentes: se pintan con la vista y siguen ahí. Una animación
// de entrada las esconde en el primer paint, que es justo lo que no queremos.
const PERSISTENT_SURFACE_FILES = [
  "features/library/components/library-view-content.tsx",
  "features/library/components/library-view-list.tsx",
  "features/library/components/library-view-toolbar.tsx",
] as const;

describe("desktop redesign interaction contract", () => {
  test("names the properties animated by redesigned interactions", () => {
    const offenders = REDESIGNED_INTERACTION_FILES.filter((file) =>
      read(file).includes("transition-all"),
    );

    expect(
      offenders,
      "Use explicit transition properties so hover and state motion remain predictable",
    ).toEqual([]);
  });

  test("keeps Settings as a route surface instead of a modal shell", () => {
    const settingsRoute = read(
      "features/settings/components/SettingsRoute.tsx",
    );

    expect(settingsRoute).toContain("data-settings-route");
    expect(settingsRoute).not.toContain("aria-modal");
    expect(settingsRoute).not.toContain('role: "dialog"');
    expect(settingsRoute).not.toContain("fixed inset-0");
  });

  test("guards every redesigned moving surface with reduced-motion", () => {
    const movingSurfaces = [
      "Home.tsx",
      "features/library/components/LibraryPlayerFooter.tsx",
      "features/transcriptions/components/TranscriptionList.tsx",
      "features/voice/components/VoiceView.tsx",
    ];

    expect(
      movingSurfaces.filter((file) => !read(file).includes("useReducedMotion")),
    ).toEqual([]);
  });

  test("does not hide persistent native work surfaces before their first paint", () => {
    const styleRow = read(
      "features/personalization/components/CompactStyleRow.tsx",
    );

    expect(
      PERSISTENT_SURFACE_FILES.filter((file) =>
        read(file).includes("initial={reduceMotion"),
      ),
    ).toEqual([]);
    expect(styleRow).toContain("initial={false}");
  });
});
