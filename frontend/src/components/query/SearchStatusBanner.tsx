import { Alert, Button, CircularProgress } from "@mui/material";
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { indexMissingDocuments, type QueryStatus } from "../../api/query";

interface SearchStatusBannerProps {
  status: QueryStatus;
  /** Called after a backfill is queued, so the page re-reads the status. */
  onChanged: () => void;
}

/**
 * The one line that explains why a question might come back empty. Indexing
 * is invisible everywhere else — the document grid shows extraction status
 * only — so this is the single place the user learns a document is not
 * searchable yet.
 */
export default function SearchStatusBanner({
  status,
  onChanged,
}: SearchStatusBannerProps) {
  const [queuing, setQueuing] = useState(false);

  if (!status.qdrant) {
    return (
      <Alert severity="error" variant="outlined">
        Search is offline — the vector store isn&apos;t reachable. Start it with{" "}
        <code>docker start qdrant</code>, then reload.
      </Alert>
    );
  }

  if (status.unindexed > 0) {
    const n = status.unindexed;
    return (
      <Alert
        severity="info"
        variant="outlined"
        action={
          <Button
            color="inherit"
            size="small"
            disabled={queuing}
            startIcon={queuing ? <CircularProgress size={14} color="inherit" /> : undefined}
            onClick={() => {
              setQueuing(true);
              indexMissingDocuments()
                .then(onChanged)
                .finally(() => setQueuing(false));
            }}
          >
            Make searchable
          </Button>
        }
      >
        {n} document{n === 1 ? " isn't" : "s aren't"} searchable yet.
      </Alert>
    );
  }

  if (status.indexing > 0) {
    const n = status.indexing;
    return (
      <Alert
        severity="info"
        variant="outlined"
        icon={<CircularProgress size={18} />}
      >
        Indexing {n} document{n === 1 ? "" : "s"} — {n === 1 ? "it" : "they"}&apos;ll
        be searchable in a moment.
      </Alert>
    );
  }

  if (status.searchable === 0) {
    return (
      <Alert
        severity="info"
        variant="outlined"
        action={
          <Button component={RouterLink} to="/upload" color="inherit" size="small">
            Upload
          </Button>
        }
      >
        No documents to search yet. Upload one to start asking questions.
      </Alert>
    );
  }

  return null;
}
