/**
 * Shared grid for collection pages — card width is fixed, columns reflow.
 * Lives apart from ContentCard so that file exports components only; mixing
 * the two breaks fast refresh.
 */
export const CARD_GRID = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 2,
} as const;
