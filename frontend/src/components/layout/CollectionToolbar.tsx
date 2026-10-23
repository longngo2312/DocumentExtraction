import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import SearchIcon from "@mui/icons-material/Search";
import ViewListOutlinedIcon from "@mui/icons-material/ViewListOutlined";
import {
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import type { ReactNode } from "react";

export type CollectionView = "grid" | "list";
export type CollectionSort = "recent" | "name";

const SORTS: { value: CollectionSort; label: string }[] = [
  { value: "recent", label: "Last updated" },
  { value: "name", label: "Name" },
];

interface CollectionToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sort: CollectionSort;
  onSortChange: (value: CollectionSort) => void;
  view: CollectionView;
  onViewChange: (value: CollectionView) => void;
  /** Extra page-specific controls, dropped in before the view toggle. */
  children?: ReactNode;
}

/**
 * Search, sort and view-mode for a collection page. Every control here is
 * wired to something real — the filter dropdowns in the reference design have
 * no equivalent on this data yet, so they are not mocked up.
 */
export default function CollectionToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  sort,
  onSortChange,
  view,
  onViewChange,
  children,
}: CollectionToolbarProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      useFlexGap
      sx={{ flexWrap: "wrap", alignItems: "center", mb: 2.5 }}
    >
      <TextField
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={searchPlaceholder}
        size="small"
        type="search"
        aria-label={searchPlaceholder}
        sx={{ flexGrow: 1, minWidth: 220 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: "text.disabled" }} />
              </InputAdornment>
            ),
          },
        }}
      />

      <TextField
        select
        size="small"
        value={sort}
        onChange={(event) => onSortChange(event.target.value as CollectionSort)}
        aria-label="Sort by"
        sx={{ minWidth: 150 }}
      >
        {SORTS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {children}

      <ToggleButtonGroup
        size="small"
        exclusive
        value={view}
        onChange={(_event, value) => {
          // Null arrives when the active button is clicked again — keep the
          // current view rather than leaving the group with nothing selected.
          if (value) onViewChange(value as CollectionView);
        }}
        aria-label="View mode"
      >
        <Tooltip title="Grid">
          <ToggleButton value="grid" aria-label="Grid view">
            <GridViewOutlinedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
        <Tooltip title="List">
          <ToggleButton value="list" aria-label="List view">
            <ViewListOutlinedIcon fontSize="small" />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
    </Stack>
  );
}
