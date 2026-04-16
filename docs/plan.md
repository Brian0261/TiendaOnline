# Plan de Implementación — Corrección de UX Carrito

## Diagnóstico de Causas Raíz

### Bug 1: Alerta de stock inconsistente en AddToCartModal

**Síntoma:** El mensaje "Solo hay X unidades disponibles" aparece a veces pero no siempre, dependiendo del producto o del momento.

**Causa raíz:** La función `changeQty()` en `AddToCartModal.tsx` **no tiene bloque `catch`** para errores 409 del backend.

El flujo actual es:

1. El usuario presiona +/− en el modal.
2. `changeQty()` aplica una validación **client-side** con `maxByStock` (stock cargado al abrir el catálogo).
3. Si la validación client-side pasa, llama a `setQuantity()` → `api.put("/cart/update/0", ...)`.
4. El backend valida stock real en `inventoryRepository.getAvailableStockByProductId()` y devuelve 409 si `nextQty > disponible`.
5. **El 409 no es capturado.** No hay `catch` — solo `finally`. El error se propaga como unhandled promise rejection.
6. `setQty(q)` ya se ejecutó antes del `await`, dejando el UI con una cantidad incorrecta.
7. No se muestra ninguna alerta.

**¿Por qué funciona "a veces"?** Cuando el stock del catálogo coincide con el stock real del backend, la validación client-side (`q > maxByStock`) atrapa el exceso y muestra la alerta localmente. Pero cuando el stock cambió desde que se cargó la página (otro usuario compró, se actualizó inventario, etc.), la validación client-side pasa y el backend rechaza con 409 sin que el frontend lo maneje.

**Archivos afectados:**

- `apps/web/src/shared/AddToCartModal.tsx` — `changeQty()` líneas 62-79 (sin catch para 409)

---

### Bug 2: Latencia perceptible en botones +/− (especialmente en staging)

**Síntoma:** Al presionar +/− en la página del carrito o en el modal, hay un retraso visible antes de que cambie la cantidad. Los botones se sienten "pesados".

**Causa raíz:** No hay actualizaciones optimistas. El UI espera la respuesta completa del servidor antes de reflejar cambios.

**Flujo actual en CartPage:**

1. Click en +/− → `mutateQty.mutate()`
2. Botones se deshabilitan (`isPending`)
3. `setQuantity()` → HTTP PUT al backend (round-trip de red)
4. `onSuccess` → `invalidateQueries(["cart", "items"])` → nuevo GET al backend (segundo round-trip)
5. React re-renderiza con datos frescos
6. Botones se habilitan

**Total:** 2 round-trips de red antes de que el usuario vea el cambio. En staging (~100-300ms por request), esto suma 200-600ms mínimo.

**Flujo actual en AddToCartModal:**

- `setQty(q)` actualiza el número mostrado inmediatamente (parcialmente optimista), pero botones quedan deshabilitados hasta completar `setQuantity()` + 2× `invalidateQueries()`. Son 3 awaits secuenciales.

**Archivos afectados:**

- `apps/web/src/pages/cart/CartPage.tsx` — `mutateQty` sin `onMutate` optimista
- `apps/web/src/shared/AddToCartModal.tsx` — `changeQty()` con 3 awaits secuenciales bloqueantes

---

## Plan de Implementación por Fases

### Fase 1 — Corrección de alerta de stock (Bug 1)

**Objetivo:** Garantizar que la alerta de stock se muestre siempre, tanto por validación client-side como por respuesta 409 del backend.

**Cambios en `AddToCartModal.tsx`:**

1. Agregar `catch` en `changeQty()` que capture errores con `status === 409`.
2. Extraer `disponible` del error: `error.details.detail.disponible` (misma estructura que CartPage).
3. Mostrar `setStockWarning(...)` con el valor real de `disponible` del backend.
4. Revertir `qty` al valor anterior cuando el backend rechaza (rollback del `setQty(q)` optimista).
5. Re-lanzar errores que NO sean 409 para no ocultar otros problemas.

**Estimación de impacto:** Solo 1 archivo modificado. Sin cambios en backend.

---

### Fase 2 — Mejora de rendimiento percibido (Bug 2)

**Objetivo:** Actualizar el UI inmediatamente al presionar +/−, sin esperar al servidor.

#### 2A — Optimistic updates en CartPage

**Cambios en `CartPage.tsx`:**

1. Agregar `onMutate` en `mutateQty` para:
   - Cancelar queries en vuelo: `queryClient.cancelQueries(["cart", "items"])`
   - Guardar snapshot previo: `queryClient.getQueryData(["cart", "items"])`
   - Actualizar cache optimistamente: `queryClient.setQueryData(["cart", "items"], ...)` con la nueva cantidad
   - Retornar `{ previousItems }` como contexto de rollback
2. Agregar `onError` con rollback: restaurar `previousItems` si el request falla.
3. Agregar `onSettled`: invalidar queries para sincronizar con servidor (ya existe, solo mover a `onSettled`).
4. Mantener el manejo de 409 existente en `onError` (alerta de stock + rollback).

#### 2B — Reducir awaits bloqueantes en AddToCartModal

**Cambios en `AddToCartModal.tsx`:**

1. Ejecutar `setQuantity()` sin await bloqueante visible (fire-and-forget con manejo de error).
2. Desacoplar `invalidateQueries` del bloqueo de UI: ejecutar en background después del `finally`.
3. `setQty(q)` ya es optimista — conservar eso. Solo agregar rollback en el catch.
4. No deshabilitar botones con `busy` durante el request completo — solo aplicar un debounce corto para evitar double-clicks.

**Estimación de impacto:** 2 archivos modificados. Sin cambios en backend.

---

### Fase 3 — QA Local (`http://localhost:8080`)

**Precondición:** `docker compose up -d` con servicios corriendo.

| #   | Caso de prueba                                                                         | Resultado esperado                                                                                           |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Catálogo → "Agregar" producto con stock=5 → modal abre con qty=1 → presionar + hasta 5 | Alerta "Solo hay 5 unidades disponibles" aparece al llegar a 5. Botón + deshabilitado.                       |
| 2   | Catálogo → "Agregar" producto con stock=5 cuando ya tiene 4 en carrito                 | Modal abre con qty=5. Alerta visible inmediatamente.                                                         |
| 3   | Catálogo → "Agregar" producto con stock=0                                              | Botón "Agregar" deshabilitado (label "Agotado").                                                             |
| 4   | Detalle → "Agregar al carrito" → modal → presionar + más allá del stock                | Mismos comportamientos que caso 1.                                                                           |
| 5   | Carrito → presionar + más allá del stock disponible                                    | Cantidad revierte al valor previo. Alerta "Solo hay X unidades" aparece bajo el control de cantidad.         |
| 6   | Carrito → presionar + rápido 5 veces (stress test)                                     | UI no se rompe. Cantidad incrementa fluidamente. Sin errores de consola no manejados.                        |
| 7   | Carrito → presionar + y chequear que cantidad visual cambia < 100ms                    | Cantidad se actualiza inmediatamente (optimistic). Confirmación del servidor llega después sin salto visual. |
| 8   | Modal → presionar + cuando backend es lento (throttle en DevTools → Slow 3G)           | Número cambia inmediatamente. Si el backend rechaza, revierte y muestra alerta.                              |
| 9   | Modal → cerrar y abrir con otro producto diferente                                     | Alerta no persiste del producto anterior. Stock se muestra correcto para el nuevo producto.                  |
| 10  | Carrito → editar input manualmente a un número > stock → Tab/Enter                     | Alerta de stock aparece. Cantidad revierte al máximo disponible o al valor previo.                           |

**Herramientas:**

- DevTools → Network → Throttle para simular latencia
- Consola del navegador para verificar ausencia de unhandled rejections
- React DevTools para verificar re-renders mínimos

---

### Fase 4 — QA Staging (`https://staging.minimarketexpress.shop`)

**Precondición:** Código desplegado en staging (previa aprobación explícita del usuario).

| #   | Verificación                                                                  | Criterio de aceptación                                      |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Repetir los 10 casos de Fase 3 en staging                                     | Todos pasan.                                                |
| 2   | Medir tiempo percibido de +/− en carrito                                      | < 100ms para feedback visual (optimistic update).           |
| 3   | Verificar con 2 pestañas simultáneas: Tab A baja stock, Tab B intenta comprar | Tab B recibe 409 correctamente manejado con alerta visible. |
| 4   | Verificar Network tab: +/− genera 1 PUT + 1 GET (no más)                      | Sin requests duplicados ni innecesarios.                    |
| 5   | Verificar consola libre de unhandled promise rejections                       | 0 errores no manejados.                                     |
| 6   | Verificar que la alerta desaparece al presionar − (volver a cantidad válida)  | Alerta se limpia automáticamente.                           |
| 7   | Checkout después de ajustar cantidades                                        | Flujo de pago funciona correctamente post-ajuste.           |

---

## Resumen de archivos a modificar

| Archivo                                  | Fase  | Tipo de cambio                             |
| ---------------------------------------- | ----- | ------------------------------------------ |
| `apps/web/src/shared/AddToCartModal.tsx` | 1, 2B | catch 409 + rollback + desacople de awaits |
| `apps/web/src/pages/cart/CartPage.tsx`   | 2A    | onMutate optimista + rollback en onError   |

**Total:** 2 archivos. 0 cambios en backend. 0 migraciones de base de datos.
