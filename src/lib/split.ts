// Motor de reparto: módulo puro (sin I/O) que reparte una cuenta en céntimos
// enteros entre los participantes de una sala. Nunca usa `float` para dinero.

export interface SplitParticipantInput {
  id: string;
  name: string;
}

export interface SplitItemInput {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SplitClaimInput {
  itemId: string;
  participantId: string;
  units: number;
}

export interface SplitExtras {
  taxCents: number;
  tipCents: number;
  discountCents: number;
}

export interface PersonItemShare {
  itemId: string;
  itemName: string;
  /** Unidades reclamadas explícitamente por esta persona (no incluye la parte de lo no reclamado). */
  claimedUnits: number;
  /** Unidades totales que paga (reclamadas + su parte prorrateada de lo no reclamado). */
  effectiveUnits: number;
  /** Si esta línea incluye una parte prorrateada de unidades que nadie reclamó. */
  hasUnclaimedShare: boolean;
  /** Su parte del precio total de esta línea, incluyendo prorrateo de unidades sin reclamar. */
  shareCents: number;
  /** Precio total de la línea (quantity * unitPriceCents), para expresar shareCents como fracción. */
  itemTotalCents: number;
}

export interface PersonSplit {
  participantId: string;
  name: string;
  items: PersonItemShare[];
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  discountCents: number;
  totalCents: number;
  /** Número total de participantes de la sala. */
  participantCount: number;
}

export interface SplitResult {
  people: PersonSplit[];
  /** Ids de líneas con unidades sin reclamar. */
  unclaimedItemIds: string[];
  grandTotalCents: number;
  /** Suma de los subtotales de todas las personas: base usada para prorratear IVA/propina/descuento. */
  subtotalTotalCents: number;
}

export interface ComputeSplitInput {
  items: SplitItemInput[];
  claims: SplitClaimInput[];
  participants: SplitParticipantInput[];
  extras: SplitExtras;
  /** When false, leave unclaimed units out until the account is closed. */
  distributeUnclaimed?: boolean;
}

// Reparte `totalCents` entre `weights` (proporcional, no negativo) de forma que la
// suma exacta sea `totalCents`: se redondea a la baja y los céntimos sobrantes van
// a las entradas con mayor resto (método del resto mayor), en vez de partes iguales.
function allocateByWeights(totalCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalCents === 0) return new Array(n).fill(0);
  if (totalWeight <= 0) return allocateEqually(totalCents, n);

  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floors = raw.map(Math.floor);
  const allocated = floors.reduce((sum, v) => sum + v, 0);
  const remainder = totalCents - allocated;

  const order = raw
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k % n].i] += 1;
  }
  return result;
}

function allocateEqually(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

interface ItemAllocation {
  subtotals: number[];
  personItems: PersonItemShare[][];
  isUnclaimed: boolean;
}

interface IndexedClaim extends SplitClaimInput {
  participantIndex: number;
}

// Reparte una sola línea del ticket entre los participantes: cada uno se lleva su
// parte según lo que ha reclamado, y las unidades sin reclamar se prorratean a
// partes iguales entre todos (política de la sala para líneas sin asignar).
function allocateItem(
  item: SplitItemInput,
  claims: IndexedClaim[],
  n: number,
  distributeUnclaimed: boolean,
): ItemAllocation {
  const fullItemTotalCents = item.quantity * item.unitPriceCents;
  const claimedByParticipant = new Array(n).fill(0) as number[];
  let claimedSum = 0;
  for (const claim of claims) {
    if (claim.itemId !== item.id) continue;
    claimedByParticipant[claim.participantIndex] += claim.units;
    claimedSum += claim.units;
  }

  const unclaimedUnits = Math.max(0, item.quantity - claimedSum);
  const itemTotalCents = distributeUnclaimed
    ? fullItemTotalCents
    : claimedSum * item.unitPriceCents;
  const subtotals = new Array(n).fill(0) as number[];
  const personItems: PersonItemShare[][] = Array.from({ length: n }, () => []);

  if (n > 0) {
    const unclaimedShare = distributeUnclaimed ? unclaimedUnits / n : 0;
    const weights = claimedByParticipant.map((units) => units + unclaimedShare);
    const shares =
      !distributeUnclaimed && claimedSum === 0
        ? new Array(n).fill(0)
        : allocateByWeights(itemTotalCents, weights);
    for (let i = 0; i < n; i++) {
      if (shares[i] === 0 && claimedByParticipant[i] === 0) continue;
      subtotals[i] = shares[i];
      personItems[i].push({
        itemId: item.id,
        itemName: item.name,
        claimedUnits: claimedByParticipant[i],
        effectiveUnits: weights[i],
        hasUnclaimedShare: unclaimedShare > 0,
        shareCents: shares[i],
        itemTotalCents,
      });
    }
  }

  return { subtotals, personItems, isUnclaimed: unclaimedUnits > 0 };
}

export function computeSplit({
  items,
  claims,
  participants,
  extras,
  distributeUnclaimed = true,
}: ComputeSplitInput): SplitResult {
  const n = participants.length;
  const subtotals = new Array(n).fill(0) as number[];
  const personItems: PersonItemShare[][] = Array.from({ length: n }, () => []);
  const unclaimedItemIds: string[] = [];
  let itemsTotalCents = 0;

  const indexedClaims = claims
    .map((claim) => ({
      ...claim,
      participantIndex: participants.findIndex(
        (p) => p.id === claim.participantId,
      ),
    }))
    .filter((claim) => claim.participantIndex !== -1);

  for (const item of items) {
    itemsTotalCents += item.quantity * item.unitPriceCents;
    const allocation = allocateItem(item, indexedClaims, n, distributeUnclaimed);
    if (allocation.isUnclaimed) unclaimedItemIds.push(item.id);
    for (let i = 0; i < n; i++) {
      subtotals[i] += allocation.subtotals[i];
      personItems[i].push(...allocation.personItems[i]);
    }
  }

  const taxShares = allocateByWeights(extras.taxCents, subtotals);
  const tipShares = allocateByWeights(extras.tipCents, subtotals);
  const discountShares = allocateByWeights(extras.discountCents, subtotals);

  const people: PersonSplit[] = participants.map((participant, i) => ({
    participantId: participant.id,
    name: participant.name,
    items: personItems[i],
    subtotalCents: subtotals[i],
    taxCents: taxShares[i],
    tipCents: tipShares[i],
    discountCents: discountShares[i],
    totalCents: subtotals[i] + taxShares[i] + tipShares[i] - discountShares[i],
    participantCount: n,
  }));

  const grandTotalCents =
    itemsTotalCents + extras.taxCents + extras.tipCents - extras.discountCents;
  const subtotalTotalCents = subtotals.reduce((sum, v) => sum + v, 0);

  return { people, unclaimedItemIds, grandTotalCents, subtotalTotalCents };
}
