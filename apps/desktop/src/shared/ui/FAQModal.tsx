import { AnimatePresence } from "framer-motion";
import { useCallback, useRef, type MouseEvent } from "react";
import { useMountEffect } from "../hooks/useMountEffect";
import { FAQDialog } from "./faq-dialog";
import { useFAQScrollEdges } from "./faq-scroll-edges";

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FAQModal({ isOpen, onClose }: FAQModalProps) {
  const { edges, scrollRef } = useFAQScrollEdges();
  const openRef = useRef(isOpen);
  const closeRef = useRef(onClose);
  openRef.current = isOpen;
  closeRef.current = onClose;

  useMountEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) closeRef.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  const keepDialogOpen = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

  return (
    <AnimatePresence>
      {isOpen ? (
        <FAQDialog
          edges={edges}
          scrollRef={scrollRef}
          onClose={onClose}
          onPanelClick={keepDialogOpen}
        />
      ) : null}
    </AnimatePresence>
  );
}
