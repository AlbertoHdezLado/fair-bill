import { describe, expect, it, vi } from "vitest";
import { saveClaimRows } from "@/lib/rooms/claims-write";

describe("saveClaimRows", () => {
  it("falls back to the legacy owner-based claim key when group_key is missing", async () => {
    const deleteCalls: string[] = [];
    const insertedRows: unknown[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== "claims") throw new Error(`Unexpected table: ${table}`);

        return {
          delete: () => ({
            eq: (field: string, value: string) => {
              deleteCalls.push(`${field}:${value}`);
              return {
                eq: (nextField: string, nextValue: string) => {
                  deleteCalls.push(`${nextField}:${nextValue}`);
                  return {
                    eq: (groupField: string, groupValue: string) => {
                      deleteCalls.push(`${groupField}:${groupValue}`);
                      if (groupField === "group_key") {
                        return { error: { code: "42703", message: 'column "group_key" does not exist' } };
                      }
                      return { error: null };
                    },
                  };
                },
              };
            },
          }),
          insert: async (rows: unknown[]) => {
            insertedRows.push(...rows);
            return { error: null };
          },
        };
      }),
    };

    await expect(
      saveClaimRows(
        supabase as never,
        "room-1",
        "item-1",
        "owner-1",
        "group-1",
        ["p1", "p2"],
        2,
        ["p1", "p2"],
      ),
    ).resolves.toBeUndefined();

    expect(deleteCalls).toContain("room_id:room-1");
    expect(deleteCalls).toContain("item_id:item-1");
    expect(deleteCalls).toContain("group_key:group-1");
    expect(deleteCalls).toContain("owner_id:owner-1");
    expect(insertedRows).toEqual([
      expect.objectContaining({ item_id: "item-1", owner_id: "owner-1", units: 2 }),
      expect.objectContaining({ item_id: "item-1", owner_id: "owner-1", units: 2 }),
    ]);
    expect(
      insertedRows.some((row) => "group_key" in (row as Record<string, unknown>)),
    ).toBe(true);
  });
});
