/**
 * The join between two shots, and the dissolve that can live there.
 *
 * A dissolve is not time added in the middle of a clip — it is the end of one
 * shot and the start of the next playing at once. The frames to do that with
 * are the ones already either side of the cut: the tail the first shot was
 * trimmed off, and the head the second one was. So a dissolve reaches into
 * both handles by half its length, the two blocks overlap by the whole of it,
 * and the clip is exactly as long afterwards as it was before.
 *
 * Which is the part that matters beyond taste. The captions, the beds and the
 * queue are all timed against the clip; a transition that moved everything
 * after it would move them out from under their own picture, and one that
 * shortened the clip would do it twice over.
 */

/** What a join needs to know about the shot on either side of it. */
export interface JoinShot {
  id: number;
  /** Where it sits on the clip, in timeline seconds. */
  start: number;
  end: number;
  /** Where it plays from and to in its own file, in source seconds. */
  from: number;
  to: number;
  /** Source seconds per timeline second. */
  speed: number;
  /** What's left of the file either side, already in timeline seconds. */
  headroom: number;
  tailroom: number;
  /** A held picture: no footage to run out of, so the handles are as long as you like. */
  still: boolean;
  /**
   * How much of this shot's head the dissolve at its start was paid for with.
   *
   * Written when the dissolve is made, so taking it off again puts back
   * exactly what each side gave. Without it the only honest guess is half
   * each, which is wrong whenever one side paid for all of it — and then the
   * cut creeps along the strip a little every time the mark is pressed.
   */
  dissolveHead: number | null;
  /** Whether it dissolves in from whatever is under it. */
  fadeIn: boolean;
  lane: number;
}

export interface Join {
  /** The shot going out, and the one coming in. */
  from: JoinShot;
  to: JoinShot;
  /** Where the cut is, in timeline seconds — the middle of a dissolve. */
  at: number;
  /** How long the two already overlap for; zero at a plain cut. */
  overlap: number;
  /** Whether that overlap is actually dissolving rather than one covering the other. */
  dissolving: boolean;
  /**
   * The longest dissolve the handles either side could pay for, together.
   *
   * Together, not the lesser of the two. It used to be twice the smaller
   * handle, which meant a dissolve was impossible unless *both* shots had
   * been trimmed — so two files dropped in whole, which is how most clips
   * start, could never have one. A dissolve centred on the cut is the nice
   * case, not the only one: where one side has nothing to give, the other
   * pays for the lot and the overlap sits to one side of the cut. Every
   * editor calls those start-at-cut and end-at-cut; they are dissolves.
   */
  room: number;
}

/** How much a shot can give at each end, with a still being as giving as you like. */
function handles(shot: JoinShot): { head: number; tail: number } {
  return shot.still
    ? { head: Infinity, tail: Infinity }
    : { head: shot.headroom, tail: shot.tailroom };
}

/**
 * The joins in a clip: every place one shot gives way to the next.
 *
 * Found by time rather than by lane, because that is what a join is — the next
 * shot to start after this one ends. Shots that merely overlap on different
 * lanes are a cover, not a cut, and are left alone; the test is whether they
 * meet at the cut or inside a dissolve's reach of it.
 */
export function joinsOf(shots: JoinShot[], seconds: number): Join[] {
  const order = [...shots].sort((a, b) => a.start - b.start || a.lane - b.lane);
  const joins: Join[] = [];

  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to = order[i + 1];
    const overlap = Math.max(0, from.end - to.start);

    // Touching, or overlapping by no more than a dissolve would. Anything
    // deeper is one shot laid over another on purpose.
    const reach = Math.max(seconds, 0.05) + 0.05;
    if (to.start - from.end > 0.05 || overlap > reach) continue;

    const room = handles(from).tail + handles(to).head;
    joins.push({
      from,
      to,
      at: overlap > 0 ? to.start + overlap / 2 : to.start,
      overlap,
      dissolving: overlap > 0.001 && to.fadeIn,
      room: Number.isFinite(room) ? room : Infinity
    });
  }

  return joins;
}

/** The edits that turn a cut into a dissolve, or a dissolve back into a cut. */
export interface JoinPatch {
  id: number;
  trimStart?: number;
  trimEnd?: number;
  start?: number;
  fadeIn?: boolean;
  dissolveHead?: number | null;
}

/**
 * Half each side where both can pay, and whatever one side can where the other
 * can't.
 *
 * Centred on the cut is the nice case: the tail the first shot was trimmed off
 * and the head the second one was, half the dissolve from each. Most clips
 * never get there — files are dropped in whole, so neither has been trimmed
 * and neither has a handle. But a shot that *was* trimmed has a tail going
 * spare, and one shot's spare tail is a whole dissolve: the first shot plays on
 * past the cut while the second fades up over it, nothing after the pair moves,
 * and the clip is the same length. The mirror image works too.
 *
 * What each side actually paid is written down on the incoming shot, because
 * taking the dissolve off again has to give back exactly that.
 *
 * Only the incoming shot fades. It is drawn over the outgoing one, so it is
 * the only one that needs to: fading both would dip through black in the
 * middle, which is a different transition and a worse one.
 */
export function dissolveJoin(join: Join, seconds: number): JoinPatch[] {
  const { from, to } = join;
  const tail = handles(from).tail;
  const head = handles(to).head;

  const possible = Math.min(
    Math.max(0.05, seconds),
    tail + head,
    // Never longer than either shot: a dissolve that outlasts what it is
    // dissolving isn't one.
    (from.end - from.start) * 2,
    (to.end - to.start) * 2
  );
  if (!(possible > 0)) return [];

  let fromTake = Math.min(possible / 2, tail);
  let toTake = possible - fromTake;
  if (toTake > head) {
    toTake = head;
    fromTake = possible - head;
  }

  return [
    {
      id: from.id,
      // The tail it was trimmed off, played after all.
      trimEnd: round(from.to + fromTake * from.speed)
    },
    {
      id: to.id,
      // Back by its share, with the frames to fill it.
      //
      // Footage has them behind its in-point, so the in-point moves back and
      // the shot is that much longer. A still has no in-point to move — it is
      // held for as long as it is asked to be — so it is asked for that much
      // more holding instead. Either way the block grows at the front by
      // exactly what it moved, and where it *ends* doesn't move.
      ...(to.still
        ? { trimEnd: round(to.to + toTake * to.speed) }
        : { trimStart: round(Math.max(0, to.from - toTake * to.speed)) }),
      start: round(Math.max(0, to.start - toTake)),
      fadeIn: true,
      dissolveHead: round(toTake)
    }
  ];
}

/**
 * The same, backwards: the handles go back and the shots meet at a cut again.
 *
 * Each side takes back what it gave, which is why the giving was written down.
 * Halving it instead was right only for a dissolve centred on the cut, and
 * wrong by half a dissolve for every other one — the cut would land somewhere
 * new each time the mark was pressed, and walk along the strip.
 */
export function cutJoin(join: Join): JoinPatch[] {
  const { from, to } = join;
  const toTake = Math.min(join.overlap, to.dissolveHead ?? join.overlap / 2);
  const fromTake = join.overlap - toTake;

  return [
    { id: from.id, trimEnd: round(from.to - fromTake * from.speed) },
    {
      id: to.id,
      ...(to.still
        ? { trimEnd: round(to.to - toTake * to.speed) }
        : { trimStart: round(to.from + toTake * to.speed) }),
      start: round(to.start + toTake),
      fadeIn: false,
      dissolveHead: null
    }
  ];
}

/** Thousandths. Finer than anything a hand can mean, coarse enough to compare. */
function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
