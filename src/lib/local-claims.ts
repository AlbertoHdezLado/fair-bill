// Modo local "pasa el móvil": cada participante marca, en su turno, qué ha tomado
// de cada línea del ticket. Se guarda la *elección* (todo / una unidad / una
// parte) y no las unidades ya calculadas, para poder editarla después.

import type { EditableItem } from "@/lib/receipt/editable";
import type { SplitClaimInput } from "@/lib/split";

export type ClaimChoice =
  | { mode: "half" }
  // `count` es el TOTAL de unidades que consume el grupo entero (no la
  // parte de cada persona); `group` son las claves de todos los que la
  // comparten (incluida esta persona). Sin `group` equivale a un grupo de 1
  // (elección en solitario). Todas las personas del grupo guardan la misma
  // elección, para poder reconstruir el reparto al reeditarla.
  | { mode: "units"; count: number; group?: readonly string[] };

export type ClaimMode = ClaimChoice["mode"] | "none";

/**
 * Una elección dentro de la lista de una persona. `owner` es quien la creó: una
 * elección compartida se replica en todos los miembros del grupo, pero solo su
 * autor puede editarla o borrarla. Así una persona puede acumular a la vez lo
 * que marcó en solitario y lo que otro compartió después con ella.
 */
export interface ClaimEntry {
  readonly owner: string;
  /** Identity of the choice; falls back to `owner` for legacy single-group data. */
  readonly groupId?: string;
  readonly choice: ClaimChoice;
}

/** clave de participante -> id de línea -> elecciones que le afectan */
export type LocalClaims = Record<string, Record<string, ClaimEntry[]>>;

/** Unidades totales (antes de repartir) que representa una elección. */
export function choiceTotalUnits(
  item: EditableItem,
  choice: ClaimChoice,
): number {
  switch (choice.mode) {
    case "half":
      return 0.5;
    case "units":
      return Math.min(Math.max(choice.count, 0), item.quantity);
  }
}

/** Personas (incluida la propia) que comparten una elección; [] si no hay elección. */
export function choiceGroup(
  participantKey: string,
  choice: ClaimChoice | null | undefined,
): readonly string[] {
  if (!choice) return [];
  if (choice.mode === "units" && choice.group) return choice.group;
  return [participantKey];
}

export function choiceUnits(item: EditableItem, choice: ClaimChoice): number {
  switch (choice.mode) {
    case "half":
      return 0.5;
    case "units": {
      const divisor = Math.max(choice.group?.length ?? 1, 1);
      return choiceTotalUnits(item, choice) / divisor;
    }
  }
}

/** Todas las elecciones que afectan a una persona en una línea. */
export function entriesFor(
  claims: LocalClaims,
  participantKey: string,
  itemId: string,
): readonly ClaimEntry[] {
  return claims[participantKey]?.[itemId] ?? [];
}

/** La elección que creó esa persona (la única que puede editar), si existe. */
export function ownChoice(
  claims: LocalClaims,
  participantKey: string,
  itemId: string,
): ClaimChoice | null {
  const entry = entriesFor(claims, participantKey, itemId).find(
    (candidate) => candidate.owner === participantKey,
  );
  return entry?.choice ?? null;
}

export function claimedUnits(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): number {
  return entriesFor(claims, participantKey, item.id).reduce(
    (total, entry) => total + choiceUnits(item, entry.choice),
    0,
  );
}

/** Unidades de una línea ya marcadas por el resto de participantes. */
export function unitsTakenByOthers(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): number {
  let total = 0;
  for (const key of Object.keys(claims)) {
    if (key === participantKey) continue;
    total += claimedUnits(item, claims, key);
  }
  return total;
}

/**
 * Unidades ya marcadas descontando las elecciones creadas por `ownerKey`: son
 * las que quedan realmente bloqueadas mientras esa persona reedita su propia
 * elección, porque la suya se reemplaza por completo en todo el grupo.
 */
export function unitsTakenExcludingOwner(
  item: EditableItem,
  claims: LocalClaims,
  ownerKey: string,
): number {
  let total = 0;
  for (const key of Object.keys(claims)) {
    for (const entry of entriesFor(claims, key, item.id)) {
      if (entry.owner === ownerKey) continue;
      total += choiceUnits(item, entry.choice);
    }
  }
  return total;
}

export function setClaimChoice(
  claims: LocalClaims,
  participantKey: string,
  itemId: string,
  owner: string,
  choice: ClaimChoice | null,
): LocalClaims {
  const forPerson = { ...(claims[participantKey] ?? {}) };
  const fromOthers = (forPerson[itemId] ?? []).filter(
    (entry) => entry.owner !== owner,
  );
  const next = choice === null ? fromOthers : [...fromOthers, { owner, choice }];
  if (next.length === 0) delete forPerson[itemId];
  else forPerson[itemId] = next;
  return { ...claims, [participantKey]: forPerson };
}

/** Al eliminar a un participante se borran sus elecciones y sale de los grupos. */
export function removeParticipantClaims(
  claims: LocalClaims,
  removedKey: string,
): LocalClaims {
  const next: LocalClaims = {};
  for (const key of Object.keys(claims)) {
    if (key === removedKey) continue;
    const byItem: Record<string, ClaimEntry[]> = {};
    for (const [itemId, entries] of Object.entries(claims[key])) {
      const kept = entries
        .filter((entry) => entry.owner !== removedKey)
        .map((entry) => {
          const { choice } = entry;
          if (choice.mode !== "units" || !choice.group) return entry;
          return {
            owner: entry.owner,
            choice: {
              ...choice,
              group: choice.group.filter((member) => member !== removedKey),
            },
          };
        });
      if (kept.length > 0) byItem[itemId] = kept;
    }
    next[key] = byItem;
  }
  return next;
}

/** No se marca ninguna línea por defecto al iniciar un turno vacío. */
export function selectDefaultItemForParticipant(
  items: readonly EditableItem[],
  claims: LocalClaims,
  participantKey: string,
): LocalClaims {
  void items;
  void participantKey;
  return claims;
}

/** Unidades de una línea ya marcadas por cualquier participante (incluida esta persona). */
export function unitsTakenByAll(
  item: EditableItem,
  claims: LocalClaims,
): number {
  let total = 0;
  for (const key of Object.keys(claims)) {
    total += claimedUnits(item, claims, key);
  }
  return total;
}

/**
 * Unidades marcadas en modo compartido (grupo > 1), sin duplicar por cada
 * miembro del grupo replicado en `claims`.
 */
export function sharedUnitsByAll(
  item: EditableItem,
  claims: LocalClaims,
): number {
  let total = 0;
  for (const ownerKey of Object.keys(claims)) {
    const choice = ownChoice(claims, ownerKey, item.id);
    if (choice?.mode !== "units") continue;
    if (!choice.group || choice.group.length === 0) continue;
    total += choiceTotalUnits(item, choice);
  }
  return total;
}

export function hasSharedUnits(item: EditableItem, claims: LocalClaims): boolean {
  return sharedUnitsByAll(item, claims) > 0;
}

/**
 * Una elección vista como grupo: `units` son las unidades que consume el grupo
 * entero y `memberIds` quiénes se las reparten (una persona sola es un grupo
 * de uno). `groupId` identifica la elección: es la clave con la que se guarda
 * y se reemplaza en el servidor.
 */
export interface ItemGroup {
  readonly groupId: string;
  readonly ownerId: string;
  readonly memberIds: readonly string[];
  readonly units: number;
}

/** Grupos que hay sobre una línea, sin duplicar la copia de cada miembro. */
export function itemGroups(
  item: EditableItem,
  claims: LocalClaims,
): ItemGroup[] {
  const byGroup = new Map<string, ItemGroup>();
  for (const participantKey of Object.keys(claims)) {
    for (const entry of entriesFor(claims, participantKey, item.id)) {
      const groupId = entry.groupId ?? entry.owner;
      if (byGroup.has(groupId)) continue;
      const { choice } = entry;
      const memberIds =
        choice.mode === "units" && choice.group?.length
          ? [...choice.group]
          : [entry.owner];
      byGroup.set(groupId, {
        groupId,
        ownerId: entry.owner,
        memberIds,
        units: choiceTotalUnits(item, choice),
      });
    }
  }
  return [...byGroup.values()];
}

/** Unidades de una línea repartidas entre todos los grupos existentes. */
export function assignedUnits(item: EditableItem, claims: LocalClaims): number {
  return itemGroups(item, claims).reduce(
    (total, group) => total + group.units,
    0,
  );
}

/** Unidades de una línea que nadie ha cogido todavía. */
export function freeUnits(item: EditableItem, claims: LocalClaims): number {
  return Math.max(0, item.quantity - assignedUnits(item, claims));
}

/**
 * Una línea deja de mostrarse a un participante cuando entre todos ya han marcado
 * todas sus unidades, salvo que sea quien la está editando (para poder
 * corregir su propia selección).
 */
export function isItemFullyClaimedByOthers(
  item: EditableItem,
  claims: LocalClaims,
  participantKey: string,
): boolean {
  if (entriesFor(claims, participantKey, item.id).length > 0) return false;
  return unitsTakenByAll(item, claims) >= item.quantity;
}

export function buildSplitClaims(
  items: EditableItem[],
  participantKeys: string[],
  claims: LocalClaims,
): SplitClaimInput[] {
  const result: SplitClaimInput[] = [];
  for (const item of items) {
    for (const participantId of participantKeys) {
      const units = claimedUnits(item, claims, participantId);
      if (units > 0) result.push({ itemId: item.id, participantId, units });
    }
  }
  return result;
}
