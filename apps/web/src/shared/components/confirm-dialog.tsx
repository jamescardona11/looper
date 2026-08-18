// Imperative confirm dialog. Replaces native window.confirm with a Base-UI
// modal that matches the design system (focus trap, scroll lock, exit
// transition). Mounted once in __root.tsx; call useConfirm() anywhere to get an
// async confirm(options) => Promise<boolean> that resolves true on confirm and
// false on cancel/dismiss. Cancel is first in the DOM so it takes initial focus
// — the destructive action is never the default.
import { useTranslation } from "@looper/i18n/react";
import { createContext, type ReactNode, use, useCallback, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = use(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Resolve the pending promise and start the close transition. `options` is
  // kept so the dialog stays painted while it animates out.
  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={open} onOpenChange={(next) => !next && settle(false)}>
        {options ? (
          <DialogContent showClose={false} className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              {options.description ? (
                <DialogDescription>{options.description}</DialogDescription>
              ) : null}
            </DialogHeader>
            <div className="flex justify-end gap-2 p-6 pt-2">
              <Button variant="ghost" onClick={() => settle(false)}>
                {options.cancelLabel ?? t("common.cancel")}
              </Button>
              <Button
                variant={options.destructive ? "destructive" : "primary"}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? t("common.confirm")}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
