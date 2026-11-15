/** Rejects asynchronous results from a previous vault unlock session. */
export function createC2SessionGuard(initiallyUnlocked: boolean) {
  let unlocked = initiallyUnlocked;
  let epoch = 0;
  return {
    update(nextUnlocked: boolean) {
      if (nextUnlocked !== unlocked) epoch += 1;
      unlocked = nextUnlocked;
    },
    capture() {
      const requestEpoch = epoch;
      return () => unlocked && requestEpoch === epoch;
    },
  };
}
