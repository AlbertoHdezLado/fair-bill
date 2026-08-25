export function isMissingGroupKeyColumnError(
  error: { code?: string; message?: string } | null,
): boolean {
  return (
    (error?.code === "42703" || error?.code === "PGRST204") &&
    /group_key/.test(error.message ?? "")
  );
}

export async function saveClaimRows(
  supabase: {
    from: (table: string) => {
      delete: () => {
        eq: (
          field: string,
          value: string,
        ) => Promise<{ error: { code?: string; message?: string } | null }>;
      };
      insert: (
        rows: Record<string, unknown>[],
      ) => Promise<{ error: { code?: string; message?: string } | null }>;
    };
  },
  roomId: string,
  itemId: string,
  ownerId: string,
  groupKey: string,
  participantIds: string[],
  units: number | null,
  groupIds: string[],
): Promise<void> {
  const deleteResult = await supabase
    .from("claims")
    .delete()
    .eq("room_id", roomId)
    .eq("item_id", itemId)
    .eq("group_key", groupKey);

  if (deleteResult.error && !isMissingGroupKeyColumnError(deleteResult.error)) {
    throw new Error("Could not save");
  }

  if (deleteResult.error && isMissingGroupKeyColumnError(deleteResult.error)) {
    const legacyDeleteResult = await supabase
      .from("claims")
      .delete()
      .eq("room_id", roomId)
      .eq("item_id", itemId)
      .eq("owner_id", ownerId);

    if (legacyDeleteResult.error) {
      throw new Error("Could not save");
    }
  }

  if (units === null || participantIds.length === 0) return;

  const rows = participantIds.map((participantId) => ({
    room_id: roomId,
    item_id: itemId,
    participant_id: participantId,
    owner_id: ownerId,
    group_key: groupKey,
    units,
    group_ids: groupIds,
  }));

  const insertResult = await supabase.from("claims").insert(rows);
  if (!insertResult.error) return;

  if (!isMissingGroupKeyColumnError(insertResult.error)) {
    throw new Error("Could not save");
  }

  const legacyInsertResult = await supabase
    .from("claims")
    .insert(rows.map(({ group_key: _groupKey, ...row }) => row));

  if (legacyInsertResult.error) {
    throw new Error("Could not save");
  }
}
