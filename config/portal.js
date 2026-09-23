// Portal layout settings. Client identity and Hubstaff dashboard data are loaded
// from the authenticated client's database record.
export const PORTAL_CONFIG = {
  welcomeMessage: "Here is your performance overview and AI workspace.",

  // Easy sizing controls for the reusable AI Assistant component.
  // Fixed example: "680px"
  // Fit-screen example: "calc(100dvh - 220px)"
  assistantPanel: {
    height: "680px",
    minHeight: "540px",
  },

};
