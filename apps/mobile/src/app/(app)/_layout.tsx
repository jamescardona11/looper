import { Tabs } from "expo-router";
import { useState } from "react";
import { CaptureSheet } from "@/shared/components/capture-sheet";
import { TabBar } from "@/shared/components/tab-bar";

/**
 * Cuatro destinos cotidianos y una hoja de captura. Capturar sigue siendo una
 * acción, no una pantalla: queda en el centro para estar disponible sin
 * competir con el contenido de cada sección.
 */
const TAB_ROUTES = ["index", "notes", "ask", "studio"];

export default function AppLayout() {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigation }) => {
          // Las rutas de detalle siguen dentro del navegador de tabs. Sólo los
          // cuatro destinos principales conservan el dock persistente.
          const route = state.routes[state.index].name;
          if (!TAB_ROUTES.includes(route)) return null;

          return (
            <TabBar
              activeRoute={route}
              captureOpen={captureOpen}
              onCapture={() => setCaptureOpen(true)}
              onSelect={(next) => navigation.navigate(next)}
            />
          );
        }}
      >
        <Tabs.Screen name="index" options={{ title: "Inicio" }} />
        <Tabs.Screen name="ask" options={{ title: "Ask" }} />
        <Tabs.Screen name="notes" options={{ title: "Notas" }} />
        <Tabs.Screen name="capture" options={{ href: null }} />
        <Tabs.Screen name="studio" options={{ title: "Studio" }} />
        <Tabs.Screen name="dictation" options={{ href: null }} />
        <Tabs.Screen name="keyboard" options={{ href: null }} />
        <Tabs.Screen name="import" options={{ href: null }} />
        <Tabs.Screen name="meeting/[id]" options={{ href: null }} />
      </Tabs>
      <CaptureSheet onClose={() => setCaptureOpen(false)} visible={captureOpen} />
    </>
  );
}
