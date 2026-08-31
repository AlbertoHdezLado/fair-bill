import { describe, expect, it } from "vitest";
import { itemGroups, ownChoice } from "@/lib/local-claims";
import { toLocalClaims } from "./claims";

describe("toLocalClaims", () => {
  it("keeps a solo choice as a group of one", () => {
    const claims = toLocalClaims([
      {
        itemId: "i1",
        participantId: "p1",
        ownerId: "p1",
        groupKey: "g1",
        units: 2,
        groupIds: [],
        shared: false,
      },
    ]);

    expect(ownChoice(claims, "p1", "i1")).toEqual({ mode: "units", count: 2 });
  });

  it("copies a shared choice to every member, tagged with its author", () => {
    const claims = toLocalClaims([
      {
        itemId: "i1",
        participantId: "p1",
        ownerId: "p1",
        groupKey: "g1",
        units: 1,
        groupIds: ["p1", "p2"],
        shared: true,
      },
      {
        itemId: "i1",
        participantId: "p2",
        ownerId: "p1",
        groupKey: "g1",
        units: 1,
        groupIds: ["p1", "p2"],
        shared: true,
      },
    ]);

    expect(ownChoice(claims, "p1", "i1")).toEqual({
      mode: "units",
      count: 1,
      group: ["p1", "p2"],
    });
    // p2 did not create it, so it is not theirs to edit.
    expect(ownChoice(claims, "p2", "i1")).toBeNull();
    expect(claims.p2.i1).toHaveLength(1);
  });

  it("stacks a person's own choice with one shared with them", () => {
    const claims = toLocalClaims([
      {
        itemId: "i1",
        participantId: "p2",
        ownerId: "p2",
        groupKey: "g1",
        units: 1,
        groupIds: [],
        shared: false,
      },
      {
        itemId: "i1",
        participantId: "p2",
        ownerId: "p1",
        groupKey: "g2",
        units: 2,
        groupIds: ["p1", "p2"],
        shared: true,
      },
    ]);

    expect(claims.p2.i1).toHaveLength(2);
    expect(ownChoice(claims, "p2", "i1")).toEqual({ mode: "units", count: 1 });
  });

  it("keeps several groups owned by the same person apart", () => {
    const claims = toLocalClaims([
      {
        itemId: "i1",
        participantId: "p1",
        ownerId: "p1",
        groupKey: "g1",
        units: 1,
        groupIds: ["p1"],
        shared: false,
      },
      {
        itemId: "i1",
        participantId: "p1",
        ownerId: "p1",
        groupKey: "g2",
        units: 2,
        groupIds: ["p1", "p2"],
        shared: true,
      },
      {
        itemId: "i1",
        participantId: "p2",
        ownerId: "p1",
        groupKey: "g2",
        units: 2,
        groupIds: ["p1", "p2"],
        shared: true,
      },
    ]);

    const item = {
      id: "i1",
      name: "CERVEZA",
      quantity: 4,
      unitPriceCents: 250,
      state: "leido" as const,
    };

    expect(itemGroups(item, claims)).toEqual([
      {
        groupId: "g1",
        ownerId: "p1",
        memberIds: ["p1"],
        units: 1,
        shared: false,
        allParticipants: false,
      },
      {
        groupId: "g2",
        ownerId: "p1",
        memberIds: ["p1", "p2"],
        units: 2,
        shared: true,
        allParticipants: false,
      },
    ]);
  });
});
