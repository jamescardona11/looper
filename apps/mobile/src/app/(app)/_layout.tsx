import { Tabs } from "expo-router";
import { useState } from "react";
import { CaptureSheet } from "@/shared/components/capture-sheet";
import { TabBar } from "@/shared/components/tab-bar";

/**
 * Dos tabs y una hoja. Capturar no es un destino que se visite: es una acción
 * que abre tres, así que vive en el botón central y no en la barra. Studio sale
 * de la barra y se abre desde la cabecera de Library.
 */
const TAB_ROUTES = ["index", "ask"];

export default function AppLayout() {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={({ state, navigation }) => {
          // Las rutas con href:null siguen viviendo dentro del navegador de
          // tabs, así que sin esto la barra se cuela en pantallas empujadas
          // como Studio o Teclado, que el diseño quiere a pantalla completa.
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
        <Tabs.Screen name="index" options={{ title: "Library" }} />
        <Tabs.Screen name="ask" options={{ title: "Ask" }} />
        <Tabs.Screen name="capture" options={{ href: null }} />
        <Tabs.Screen name="studio" options={{ href: null }} />
        <Tabs.Screen name="notes" options={{ href: null }} />
        <Tabs.Screen name="dictation" options={{ href: null }} />
        <Tabs.Screen name="keyboard" options={{ href: null }} />
        <Tabs.Screen name="import" options={{ href: null }} />
        <Tabs.Screen name="meeting/[id]" options={{ href: null }} />
      </Tabs>
      <CaptureSheet onClose={() => setCaptureOpen(false)} visible={captureOpen} />
    </>
  );
}
