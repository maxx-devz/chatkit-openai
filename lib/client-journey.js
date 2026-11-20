// Client presentation from the reviewed AI Commerce guide. Internal ownership,
// milestone evidence and seven-stage records remain unchanged.
export const CLIENT_JOURNEY_STEPS = Object.freeze([
  "Get Started", "Share Your Process", "Review Your Plan", "Build & Test", "Launch & Handover",
]);
export const INTERNAL_STAGE_CLIENT_STEP = Object.freeze([1, 1, 2, 3, 4, 4, 5]);
export function clientStepForStage(stage) {
  return Number.isInteger(stage) && stage >= 1 && stage <= 7
    ? INTERNAL_STAGE_CLIENT_STEP[stage - 1] : null;
}
export function internalStagesForClientStep(step) {
  return Number.isInteger(step) && step >= 1 && step <= 5
    ? INTERNAL_STAGE_CLIENT_STEP.flatMap((value, index) => value === step ? [index + 1] : []) : [];
}
export function clientJourneyProgress(journey) {
  const currentStep = clientStepForStage(journey?.currentStage);
  const completed = currentStep !== null && journey?.completed === true && journey.currentStage === 7;
  return {
    currentStep, completed,
    steps: CLIENT_JOURNEY_STEPS.map((name, index) => ({
      step: index + 1, name,
      status: currentStep === null ? "Unconfirmed"
        : completed || index + 1 < currentStep ? "Completed"
          : index + 1 === currentStep ? "Current" : "Upcoming",
    })),
  };
}
