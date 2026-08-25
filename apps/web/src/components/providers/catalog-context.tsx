"use client";

import * as React from "react";
import type { Catalog } from "@/lib/providers/catalog";

/**
 * Makes the (database-built) provider catalog available to selector and
 * badge components without prop drilling. Provided by ChatView.
 */
const CatalogContext = React.createContext<Catalog | null>(null);

export function CatalogProvider({
  catalog,
  children,
}: Readonly<{ catalog: Catalog; children: React.ReactNode }>) {
  return (
    <CatalogContext.Provider value={catalog}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog(): Catalog {
  const catalog = React.useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog must be used within CatalogProvider");
  return catalog;
}
