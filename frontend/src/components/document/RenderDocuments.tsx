import DeleteIcon from "@mui/icons-material/Delete";
import {
  Box,
  IconButton,
  Link as MuiLink,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import type { DocumentListItem } from "../../types";
import { formatBytes, formatDayTime } from "../../utils/format";
import DocumentStatusChip from "./DocumentStatusChip";

// Size and Uploaded are the least important columns, so they collapse first.
const HIDE_ON_MOBILE = { display: { xs: "none", sm: "table-cell" } };

interface RenderDocumentsProps {
  documents: DocumentListItem[];
  onDelete: (document: DocumentListItem) => void;
}

export default function RenderDocuments({
  documents,
  onDelete,
}: RenderDocumentsProps) {
  if (documents.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
        <Typography color="text.secondary">
          No documents yet —{" "}
          <MuiLink component={RouterLink} to="/upload">
            upload one
          </MuiLink>
          .
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ overflowX: "auto" }}>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead>
            <TableRow>
              <TableCell scope="col" sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell scope="col" sx={{ fontWeight: 700 }}>Schema</TableCell>
              <TableCell scope="col" sx={{ fontWeight: 700, ...HIDE_ON_MOBILE }}>
                Size
              </TableCell>
              <TableCell scope="col" sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell scope="col" sx={{ fontWeight: 700, ...HIDE_ON_MOBILE }}>
                Uploaded
              </TableCell>
              <TableCell scope="col" sx={{ fontWeight: 700 }} align="right">
                {/* actions */}
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id} hover>
                <TableCell sx={{ maxWidth: 280 }}>
                  <MuiLink
                    component={RouterLink}
                    to={`/documents/${document.id}`}
                    variant="body2"
                    noWrap
                    title={document.filename}
                    sx={{ display: "block" }}
                  >
                    {document.filename}
                  </MuiLink>
                </TableCell>

                <TableCell>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {document.schema_name}
                  </Typography>
                </TableCell>

                <TableCell sx={HIDE_ON_MOBILE}>
                  {formatBytes(document.size_bytes)}
                </TableCell>

                <TableCell>
                  <DocumentStatusChip status={document.status} />
                </TableCell>

                <TableCell sx={{ whiteSpace: "nowrap", ...HIDE_ON_MOBILE }}>
                  {formatDayTime(document.uploaded_at)}
                </TableCell>

                <TableCell align="right">
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      aria-label={`Delete ${document.filename}`}
                      onClick={() => onDelete(document)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
