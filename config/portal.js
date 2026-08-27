// Portal-only prototype content. Editing this file does not change the AI API,
// assistant instructions, streaming, chat history, folders, or branching.
export const PORTAL_CONFIG = {
  clientName: "ChurchBanners",
  clientInitials: "CB",
  accountLabel: "Client Account",
  welcomeMessage: "Here is your performance overview and AI workspace.",

  // Easy sizing controls for the reusable AI Assistant component.
  // Fixed example: "680px"
  // Fit-screen example: "calc(100dvh - 220px)"
  assistantPanel: {
    height: "680px",
    minHeight: "540px",
  },

  metrics: [
    {
      label: "Hours Used This Month",
      value: "7.25",
      suffix: "hrs",
      detail: "of 15 hrs",
      progress: 48,
      tone: "blue",
    },
    {
      label: "Hours Remaining",
      value: "7.75",
      suffix: "hrs",
      detail: "of 15 hrs",
      progress: 52,
      tone: "orange",
    },
    {
      label: "Current Goal",
      value: "Website Growth",
      suffix: "& Optimization",
      detail: "Started May 1, 2024",
      tone: "purple",
    },
    {
      label: "Current Status",
      value: "On Track",
      suffix: "",
      detail: "Everything is progressing as planned.",
      tone: "green",
    },
  ],

  projects: [
    { name: "BigCommerce Support", detail: "Ongoing support and maintenance", status: "In Progress", progress: 60 },
    { name: "Banner Category Updates", detail: "Spring collection updates", status: "Completed", progress: 100 },
    { name: "Design Requests", detail: "New banner and site assets", status: "In Progress", progress: 50 },
    { name: "Monthly Retainer", detail: "15 hours included", status: "In Progress", progress: 48 },
  ],

  quickQuestions: [
    "How much time is left this month?",
    "What is our current goal?",
    "What is the latest project status?",
    "What work was completed this month?",
  ],
};
