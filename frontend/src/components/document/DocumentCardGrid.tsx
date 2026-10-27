import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import DeleteIcon from "@mui/icons-material/Delete";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import { Box } from "@mui/material";
import ContentCard, { PreviewGlyph } from "../layout/ContentCard";
import { CARD_GRID } from "../layout/cardGrid";
import NewItemCard from "../layout/NewItemCard";
import type { DocumentListItem } from "../../types";
import { formatBytes, formatRelative } from "../../utils/format";
import DocumentStatusChip from "./DocumentStatusChip";

/**
 * There is no page thumbnail to show until a document is rendered, so the
 * preview is the file's own kind. Matching on the mime prefix keeps this to
 * one entry per family rather than one per Office subtype.
 */
function previewFor(mimeType: string) {
  if (mimeType === "application/pdf")
    return { icon: <PictureAsPdfOutlinedIcon fontSize="inherit" />, caption: "PDF" };
  if (mimeType.startsWith("image/"))
    return { icon: <ImageOutlinedIcon fontSize="inherit" />, caption: "Image" };
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return { icon: <TableChartOutlinedIcon fontSize="inherit" />, caption: "Sheet" };
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return { icon: <SlideshowOutlinedIcon fontSize="inherit" />, caption: "Slides" };
  if (mimeType.includes("word") || mimeType.includes("document"))
    return { icon: <ArticleOutlinedIcon fontSize="inherit" />, caption: "Document" };
  return { icon: <ArticleOutlinedIcon fontSize="inherit" />, caption: "Text" };
}

interface DocumentCardGridProps {
  documents: DocumentListItem[];
  onDelete: (document: DocumentListItem) => void;
  /** The dashboard shows a preview of the collection, not the collection
   *  itself, so it leaves the "start one" tile to the Documents page. */
  showNew?: boolean;
}

export default function DocumentCardGrid({
  documents,
  onDelete,
  showNew = true,
}: DocumentCardGridProps) {
  return (
    <Box sx={CARD_GRID}>
      {showNew && <NewItemCard to="/upload" label="Upload document" />}

      {documents.map((document) => {
        const preview = previewFor(document.mime_type);
        return (
          <ContentCard
            key={document.id}
            to={`/documents/${document.id}`}
            title={document.filename}
            meta={`${document.schema_name} · ${formatBytes(document.size_bytes)} · ${formatRelative(document.uploaded_at)}`}
            badge={<DocumentStatusChip status={document.status} />}
            preview={<PreviewGlyph {...preview} />}
            menu={(close) => (
              <MenuItem
                onClick={() => {
                  close();
                  onDelete(document);
                }}
              >
                <ListItemIcon>
                  <DeleteIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText primary="Delete" />
              </MenuItem>
            )}
          />
        );
      })}
    </Box>
  );
}
