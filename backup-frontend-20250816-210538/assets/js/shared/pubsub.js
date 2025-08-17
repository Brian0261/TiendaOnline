/* Usa BroadcastChannel para notificar entre pestañas/vistas */
const ch = new BroadcastChannel("bodega");

export const triggerCatalogRefresh = () => ch.postMessage("catalog-refresh");
export const onCatalogRefresh      = (cb) => ch.addEventListener("message", e => {
  if (e.data === "catalog-refresh") cb();
});
