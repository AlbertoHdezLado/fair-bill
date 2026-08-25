import { beforeEach, describe, expect, it, vi } from "vitest";

const { findRoomMock, loadRoomStateMock, broadcastRoomUpdateMock, insertMock } =
  vi.hoisted(() => ({
    findRoomMock: vi.fn(),
    loadRoomStateMock: vi.fn(),
    broadcastRoomUpdateMock: vi.fn(),
    insertMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: vi.fn((table: string) => {
      if (table !== "participants") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn((columns: string) => ({
          eq: vi.fn(async (_field: string, value: string) => {
            if (columns === "id, name") {
              return {
                data: [{ id: "p1", name: "ALICE" }],
                error: null,
              };
            }

            return { count: 1, error: null, data: null };
          }),
        })),
        insert: insertMock,
      };
    }),
  }),
}));

vi.mock("@/lib/rooms/code", () => ({
  isValidRoomCode: (code: string) => code === "ABCD12",
}));

vi.mock("@/lib/rooms/store", () => ({
  findRoom: findRoomMock,
  loadRoomState: loadRoomStateMock,
  broadcastRoomUpdate: broadcastRoomUpdateMock,
}));

import { POST } from "./route";

describe("POST /api/rooms/[code]/participants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findRoomMock.mockResolvedValue({ id: "room-1" });
    loadRoomStateMock.mockResolvedValue({
      code: "ABCD12",
      participants: [{ id: "p1", name: "ALICE", isOwner: true }],
      items: [],
      extras: { merchantName: "", receiptHeader: [] },
      claims: [],
    });
    insertMock.mockResolvedValue({ error: null });
  });

  it("rejects duplicate participant names in the room", async () => {
    const response = await POST(
      new Request("http://localhost/api/rooms/ABCD12/participants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "alice" }),
      }),
      { params: Promise.resolve({ code: "ABCD12" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Participant name already exists",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });
});
