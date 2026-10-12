import { Box } from "@mui/material";
import { keyframes } from "@mui/system";
import type { HighlightRect } from "../../utils/quoteSearch";

// A static yellow box is easy to miss on a dense page; a couple of pulses puts
// the reviewer's eye on it without them having to hunt.
const pulse = keyframes`
  0%   { opacity: 0.85; }
  50%  { opacity: 0.35; }
  100% { opacity: 0.85; }
`;

interface HighlightOverlayProps {
  rects: HighlightRect[];
}

/**
 * Draws highlight bars over a rendered page. The parent must be
 * position:relative — the rects are offsets within it.
 *
 * Shared by the PDF and image viewers: the PDF path computes rects from the
 * text layer, and the image path will feed it scaled OCR boxes once those are
 * kept server-side.
 */
export default function HighlightOverlay({ rects }: HighlightOverlayProps) {
  if (rects.length === 0) return null;

  return (
    // pointerEvents:none so text selection and links underneath still work.
    <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {rects.map((rect, index) => (
        <Box
          key={index}
          sx={{
            position: "absolute",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            bgcolor: "warning.light",
            opacity: 0.45,
            borderRadius: 0.5,
            mixBlendMode: "multiply",
            animation: `${pulse} 900ms ease-in-out 2`,
          }}
        />
      ))}
    </Box>
  );
}
