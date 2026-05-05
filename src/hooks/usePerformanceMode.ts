// Low-end / performance mode has been removed. Lyrics & karaoke always run
// at the highest possible framerate. This shim is kept only to avoid breaking
// any straggling imports — it always returns `false` and a no-op setter.
export function usePerformanceMode(): [boolean, (v: boolean) => void] {
  return [false, () => {}];
}
