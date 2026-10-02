/** Read by screen readers, not shown (the usual "sr-only" pattern). */
export const visuallyHidden = {
  position: 'absolute',
  // Strings: in sx, a bare 1 means 100%.
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
