/**
 * The clip's own clock.
 *
 * Until now the pane played a file and everything else asked that file what
 * time it was. That works for exactly as long as the file is the clip — and it
 * never is while you are cutting: it is a render of the clip as it stood some
 * minutes ago, if one exists at all. So the strip measured one thing, the
 * picture showed another, and the way to make them agree was to go and wait for
 * a render.
 *
 * Turned around: the edit decides the time, and whatever is on screen is made
 * to follow it. A shot plays because the clock is inside it; the playhead is a
 * number, not a report from a video element. Nothing here knows about shots,
 * captions or beds — it is a time, running or parked, with a length.
 *
 * The clock free-runs on `performance.now()` rather than being read off the
 * active video, because the clip is longer than any one file in it and carries
 * on through a gap, an outro and a still, none of which have a player to ask.
 * The pictures correct themselves against this; see the stage.
 */

export class ClipPlayback {
  /** Where the playhead is, in timeline seconds. */
  at = $state(0);
  /** Whether the clock is running. */
  playing = $state(false);
  /** How long the clip is, which is where play stops and loops back. */
  duration = $state(0);

  /** Wall clock at the last tick, and the clip time that went with it. */
  #since = 0;
  #from = 0;
  #frame: number | null = null;

  /**
   * Starts the clock. From the top if it is parked at the end, because the
   * alternative is a press that does nothing and looks broken.
   */
  play(): void {
    if (this.playing) return;
    if (this.duration > 0 && this.at >= this.duration - 0.02) this.at = 0;
    this.playing = true;
    this.#since = performance.now();
    this.#from = this.at;
    this.#tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Moves the playhead, running or not. */
  seek(seconds: number): void {
    const to = Math.max(0, this.duration > 0 ? Math.min(seconds, this.duration) : seconds);
    this.at = to;
    // Re-base, so a seek mid-play carries on from where it landed rather than
    // snapping back on the next tick.
    this.#since = performance.now();
    this.#from = to;
  }

  /** Stops the loop without touching the playhead, for teardown. */
  dispose(): void {
    this.pause();
  }

  #tick = (): void => {
    if (!this.playing) return;
    const now = performance.now();
    const at = this.#from + (now - this.#since) / 1000;

    if (this.duration > 0 && at >= this.duration) {
      // Parked on the last frame rather than wrapped: a clip that looped would
      // make "is the end right?" the one question this can't answer.
      this.at = this.duration;
      this.pause();
      return;
    }

    this.at = at;
    this.#frame = requestAnimationFrame(this.#tick);
  };
}
