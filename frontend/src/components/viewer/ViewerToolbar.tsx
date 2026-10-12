import DownloadIcon from "@mui/icons-material/Download";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import ZoomOutMapIcon from "@mui/icons-material/ZoomOutMap";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";

interface ViewerToolbarProps {
  filename: string;
  fileUrl: string | null;
  /** Omitted by viewers with nothing to page through, e.g. a single image. */
  pageInfo?: string;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export default function ViewerToolbar({
  filename,
  fileUrl,
  pageInfo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: ViewerToolbarProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 2,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
        bgcolor: "surface.sunken",
      }}
    >
      <InsertDriveFileOutlinedIcon
        sx={{ fontSize: 18, color: "text.secondary" }}
      />
      <Typography
        variant="body2"
        noWrap
        title={filename}
        sx={{
          minWidth: 0,
          fontWeight: 600,
          color: "text.primary",
          fontSize: "0.8rem",
        }}
      >
        {filename}
      </Typography>

      <Box sx={{ flexGrow: 1 }} />

      {pageInfo && (
        <Chip
          label={pageInfo}
          size="small"
          variant="outlined"
          sx={{
            height: 22,
            fontSize: "0.7rem",
            fontWeight: 500,
            borderColor: "divider",
            mr: 0.5,
          }}
        />
      )}

      {/* Zoom controls grouped */}
      {(onZoomOut || onZoomReset || onZoomIn) && (
        <Box
          sx={{
            display: "inline-flex",
            gap: "2px",
            bgcolor: "action.hover",
            borderRadius: 1,
            p: "2px",
          }}
        >
          {onZoomOut && (
            <Tooltip title="Zoom out" arrow>
              <IconButton
                size="small"
                aria-label="Zoom out"
                onClick={onZoomOut}
                sx={{
                  borderRadius: 0.75,
                  width: 28,
                  height: 28,
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                <ZoomOutIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onZoomReset && (
            <Tooltip title="Fit width" arrow>
              <IconButton
                size="small"
                aria-label="Fit to width"
                onClick={onZoomReset}
                sx={{
                  borderRadius: 0.75,
                  width: 28,
                  height: 28,
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                <ZoomOutMapIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {onZoomIn && (
            <Tooltip title="Zoom in" arrow>
              <IconButton
                size="small"
                aria-label="Zoom in"
                onClick={onZoomIn}
                sx={{
                  borderRadius: 0.75,
                  width: 28,
                  height: 28,
                  "&:hover": { bgcolor: "action.selected" },
                }}
              >
                <ZoomInIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}

      <Tooltip title="Download" arrow>
        {/* Object URL, so this saves the already-downloaded blob rather than
            re-requesting a route the browser cannot authenticate. */}
        <span>
          <IconButton
            size="small"
            component="a"
            aria-label={`Download ${filename}`}
            href={fileUrl ?? undefined}
            download={filename}
            disabled={!fileUrl}
            sx={{
              borderRadius: 1,
              width: 30,
              height: 30,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <DownloadIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
