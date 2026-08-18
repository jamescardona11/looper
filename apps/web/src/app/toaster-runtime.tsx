import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

export default function ToasterRuntime() {
  const { theme } = useTheme();

  return <Toaster richColors closeButton position="top-right" theme={theme} />;
}
