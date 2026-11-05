// Facts about the running site, set at build time (client/.env.production or the Docker build).
// They appear in the privacy notice and the Terms of use, so set them before going public.
export const SITE = {
  // Where users send data requests and questions. Shown only when set.
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL || '',
  // Where the server and database are, for the PDPA notice, e.g. "Singapore (Oracle Cloud)"
  dataLocation: import.meta.env.VITE_DATA_LOCATION || '',
  // Who runs the site
  operator: import.meta.env.VITE_OPERATOR || 'a final-year Computer Science student at Universiti Teknologi MARA (UiTM)',
  // Date the Terms were last changed
  termsUpdated: '5 November 2026',
};
