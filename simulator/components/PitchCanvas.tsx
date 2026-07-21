"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MatchEvent,
  MatchReplay,
  ReplayFrame,
  ReplayPlayerFrame,
  ReplayPlayerMeta,
  Vec2,
} from "@/lib/game/types";

type Props = {
  replay: MatchReplay;
  homeColor: string;
  awayColor: string;
  pitchMaxWidth: number;
};

type InterpolatedPlayer = ReplayPlayerFrame;

export function PitchCanvas({ replay, homeColor, awayColor, pitchMaxWidth }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);
  const freezeUntilRef = useRef(0);
  const overlayUntilRef = useRef(0);
  const handledPauseEventsRef = useRef(new Set<string>());

  const [time, setTime] = useState(0);
  const [eventOverlay, setEventOverlay] = useState<MatchEvent | null>(null);
  const [playing, setPlaying] = useState(true);
  // Les multiplicateurs internes historiques sont remappés pour l'UI :
  // facteur 1 = ×0.5 affiché, 2 = ×1, 4 = ×2, 8 = ×4.
  const [speed, setSpeed] = useState<1 | 2 | 4 | 8>(2);

  const metadata = useMemo(
    () => new Map(replay.players.map((player) => [player.runtimeId, player])),
    [replay.players],
  );

  useEffect(() => {
    setTime(0);
    setPlaying(true);
    setEventOverlay(null);
    freezeUntilRef.current = 0;
    overlayUntilRef.current = 0;
    handledPauseEventsRef.current.clear();
    lastTimestampRef.current = null;
  }, [replay]);

  useEffect(() => {
    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      if (overlayUntilRef.current > 0 && timestamp >= overlayUntilRef.current) {
        overlayUntilRef.current = 0;
        setEventOverlay(null);
      }

      if (freezeUntilRef.current > 0) {
        if (timestamp < freezeUntilRef.current) {
          animationRef.current = requestAnimationFrame(tick);
          return;
        }
        freezeUntilRef.current = 0;
      }

      if (playing) {
        setTime((previous) => {
          const next = Math.min(
            replay.logicalDuration,
            previous + deltaSeconds * speed,
          );

          const crossedEvent = replay.events.find((event) => {
            const overlayMs = overlayDurationForEvent(event);
            if (overlayMs <= 0) return false;
            const displayAt = eventDisplayTime(event, replay.logicalDuration);
            const key = `${event.t}-${event.type}-${event.runtimeId ?? event.playerId ?? event.message}`;
            return (
              displayAt > previous + 1e-6 &&
              displayAt <= next + 1e-6 &&
              !handledPauseEventsRef.current.has(key)
            );
          });

          if (crossedEvent) {
            const key = `${crossedEvent.t}-${crossedEvent.type}-${crossedEvent.runtimeId ?? crossedEvent.playerId ?? crossedEvent.message}`;
            const displayAt = eventDisplayTime(crossedEvent, replay.logicalDuration);
            handledPauseEventsRef.current.add(key);
            setEventOverlay(crossedEvent);
            overlayUntilRef.current = timestamp + overlayDurationForEvent(crossedEvent);
            const freezeMs = freezeDurationForEvent(crossedEvent);
            freezeUntilRef.current = freezeMs > 0 ? timestamp + freezeMs : 0;
            return displayAt;
          }

          if (next >= replay.logicalDuration) {
            setPlaying(false);
            return replay.logicalDuration;
          }
          return next;
        });
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }
      lastTimestampRef.current = null;
    };
  }, [playing, replay.events, replay.logicalDuration, speed]);

  const snapshot = useMemo(
    () => interpolateReplay(replay.frames, time),
    [replay.frames, time],
  );

  const liveScore = useMemo(() => {
    let home = 0;
    let away = 0;
    for (const event of replay.events) {
      if (event.t > time) break;
      if (event.type === "GOAL") {
        if (event.team === "HOME") home += 1;
        if (event.team === "AWAY") away += 1;
      }
    }
    return { home, away };
  }, [replay.events, time]);

  const commentaryEvents = useMemo(
    () =>
      replay.events
        .filter((event) => event.t <= time)
        .filter(isInterestingEvent)
        .slice(-18)
        .reverse(),
    [replay.events, time],
  );

  const visibleSubstitutions = useMemo(() => {
    const duration = 6;
    const events = replay.events.filter(
      (event) =>
        event.type === "SUBSTITUTION" &&
        event.t <= time &&
        event.t + duration >= time,
    );
    return {
      home: [...events].reverse().find((event) => event.team === "HOME"),
      away: [...events].reverse().find((event) => event.team === "AWAY"),
    };
  }, [replay.events, time]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawScene(ctx, canvas, snapshot, metadata, homeColor, awayColor);
  }, [awayColor, homeColor, metadata, snapshot]);

  const clockLabel = snapshot ? formatMatchClock(snapshot) : "0:00";

  function resetPlaybackEventState() {
    setEventOverlay(null);
    freezeUntilRef.current = 0;
    overlayUntilRef.current = 0;
    // Après un seek manuel, les événements peuvent être rejoués si
    // l'utilisateur repasse dessus.
    handledPauseEventsRef.current.clear();
  }

  function seekTo(nextTime: number, pause = true) {
    const next = Math.max(0, Math.min(replay.logicalDuration, nextTime));
    setTime(next);

    if (pause || next >= replay.logicalDuration) {
      setPlaying(false);
    }

    resetPlaybackEventState();
  }

  function seekBy(seconds: number) {
    // Un saut par bouton conserve l'état lecture/pause courant.
    seekTo(time + seconds, false);
  }

  return (
    <div className="match-view-grid">
      <div className="pitch-column">
        <div
          className="match-scoreboard"
          style={{ maxWidth: `${pitchMaxWidth}px` }}
        >
          <span className="score-team score-team-home">
            <i className="score-team-dot" style={{ background: homeColor }} />
            {replay.homeName}
          </span>
          <span className="score-value">
            {liveScore.home} - {liveScore.away}
          </span>
          <span className="score-team score-team-away">
            {replay.awayName}
            <i className="score-team-dot" style={{ background: awayColor }} />
          </span>
          <span className="scoreboard-clock">{clockLabel}</span>
        </div>

        <div
          className="pitch-stage pitch-stage-vertical"
          style={{ maxWidth: `${pitchMaxWidth}px` }}
        >
          <canvas
            ref={canvasRef}
            width={820}
            height={1160}
            className="pitch-canvas pitch-canvas-vertical"
          />

          {eventOverlay && (
            <EventOverlay
              event={eventOverlay}
              color={
                eventOverlay.team === "HOME"
                  ? homeColor
                  : eventOverlay.team === "AWAY"
                    ? awayColor
                    : "#ffffff"
              }
            />
          )}

          {visibleSubstitutions.home && (
            <SubstitutionToast
              event={visibleSubstitutions.home}
              side="left"
              color={homeColor}
            />
          )}
          {visibleSubstitutions.away && (
            <SubstitutionToast
              event={visibleSubstitutions.away}
              side="right"
              color={awayColor}
            />
          )}
        </div>

        <div className="replay-controls replay-controls-v07">
          <div className="transport-controls">
            <button
              type="button"
              className="control-button transport-main-button"
              onClick={() => {
                if (time >= replay.logicalDuration) {
                  setTime(0);
                  setPlaying(true);
                  setEventOverlay(null);
                  freezeUntilRef.current = 0;
                  overlayUntilRef.current = 0;
                  handledPauseEventsRef.current.clear();
                  return;
                }
                setPlaying((value) => !value);
              }}
            >
              {playing
                ? "❚❚ Pause"
                : time >= replay.logicalDuration
                  ? "↻ Rejouer"
                  : "▶ Lecture"}
            </button>

            <div className="speed-buttons" aria-label="Vitesse de lecture">
              {([
                { value: 1 as const, label: "×0.5" },
                { value: 2 as const, label: "×1" },
                { value: 4 as const, label: "×2" },
                { value: 8 as const, label: "×4" },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className="control-button"
                  data-active={speed === value}
                  onClick={() => setSpeed(value)}
                  title={`Lecture ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="seek-controls seek-controls-bidirectional" aria-label="Naviguer dans le replay">
            <div className="seek-control-group">
              <span className="seek-label">Reculer</span>
              {[10, 5, 2, 1].map((seconds) => (
                <button
                  key={`back-${seconds}`}
                  type="button"
                  className="control-button seek-button"
                  onClick={() => seekBy(-seconds)}
                  disabled={time <= 0}
                >
                  -{seconds}s
                </button>
              ))}
            </div>

            <div className="seek-control-group">
              <span className="seek-label">Avancer</span>
              {[1, 2, 5, 10].map((seconds) => (
                <button
                  key={`forward-${seconds}`}
                  type="button"
                  className="control-button seek-button"
                  onClick={() => seekBy(seconds)}
                  disabled={time >= replay.logicalDuration}
                >
                  +{seconds}s
                </button>
              ))}
            </div>
          </div>

          <div className="timeline-row">
            <input
              type="range"
              min={0}
              max={replay.logicalDuration}
              step={0.1}
              value={time}
              onChange={(event) => {
                seekTo(Number(event.target.value));
              }}
              aria-label="Position dans le replay"
            />
            <span className="replay-time-label">
              {Math.round(time)}s / {replay.logicalDuration}s
            </span>
          </div>
        </div>

        <div className="result-banner">
          <span>Votre équipe est en bas et attaque vers le haut.</span>
          <span>Seed : {replay.seed}</span>
        </div>
      </div>

      <aside className="commentary-panel">
        <div className="commentary-header">
          <div>
            <span className="muted">Commentaires</span>
            <h2>Fil du match</h2>
          </div>
          <span className="commentary-minute">
            {clockLabel}
          </span>
        </div>

        <div className="commentary-list">
          {commentaryEvents.length === 0 ? (
            <p className="muted">Le match vient de commencer.</p>
          ) : (
            commentaryEvents.map((event, index) => (
              <EventLine
                key={`${event.t}-${event.type}-${index}`}
                event={event}
                onSeek={() => seekTo(event.t)}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function EventOverlay({ event, color }: { event: MatchEvent; color: string }) {
  if (event.type === "GOAL") {
    return (
      <div className="goal-event-overlay" style={{ "--event-color": color } as React.CSSProperties}>
        <div className="goal-event-icon">⚽</div>
        <strong>BUT</strong>
        <span>{event.message.replace(/^BUT !\s*/i, "")}</span>
      </div>
    );
  }

  return (
    <div className="match-event-overlay" style={{ "--event-color": color } as React.CSSProperties}>
      <strong>{eventTitle(event)}</strong>
      <span>{event.message}</span>
    </div>
  );
}

function SubstitutionToast({
  event,
  side,
  color,
}: {
  event: MatchEvent;
  side: "left" | "right";
  color: string;
}) {
  return (
    <div
      className={`substitution-toast substitution-toast-${side}`}
      style={{ borderColor: color }}
    >
      <span className="substitution-icon" style={{ color }}>
        ↕
      </span>
      <div>
        <strong>Changement</strong>
        <span>{event.message}</span>
      </div>
    </div>
  );
}

function EventLine({
  event,
  onSeek,
}: {
  event: MatchEvent;
  onSeek: () => void;
}) {
  return (
    <button
      type="button"
      className={`event-item event-item-clickable event-item-${event.type.toLowerCase()}`}
      onClick={onSeek}
      title="Revenir à cet événement"
    >
      <span className="event-type-icon" aria-hidden="true">{eventIcon(event)}</span>
      <span className="event-minute">{event.clockLabel ?? "—"}</span>
      <span>{event.message}</span>
    </button>
  );
}

function eventIcon(event: MatchEvent): string {
  switch (event.type) {
    case "GOAL": return "⚽";
    case "SHOT": return "↗";
    case "SAVE": return "◆";
    case "YELLOW_CARD": return "▰";
    case "RED_CARD": return "■";
    case "SUBSTITUTION": return "↕";
    case "INJURY": return "+";
    case "CORNER": return "⌜";
    case "FREE_KICK": return "◉";
    case "PENALTY": return "◎";
    case "OFFSIDE": return "⚑";
    default: return "·";
  }
}

function isInterestingEvent(event: MatchEvent): boolean {
  return [
    "GOAL",
    "SHOT",
    "SAVE",
    "MISS",
    "OFFSIDE",
    "THROW_IN",
    "CORNER",
    "GOAL_KICK",
    "FREE_KICK",
    "PENALTY",
    "ADDED_TIME",
    "YELLOW_CARD",
    "RED_CARD",
    "INJURY",
    "SUBSTITUTION",
    "HALF_TIME",
    "FULL_TIME",
  ].includes(event.type);
}

function interpolateReplay(frames: ReplayFrame[], time: number): ReplayFrame | null {
  if (frames.length === 0) return null;
  if (time <= frames[0].t) return frames[0];
  if (time >= frames[frames.length - 1].t) return frames[frames.length - 1];

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].t < time) low = mid + 1;
    else high = mid - 1;
  }

  const next = frames[low];
  const previous = frames[Math.max(0, low - 1)];
  const duration = Math.max(0.0001, next.t - previous.t);
  const alpha = (time - previous.t) / duration;

  const nextPlayers = new Map(next.players.map((player) => [player.id, player]));

  const players: InterpolatedPlayer[] = previous.players.map((player) => {
    const nextPlayer = nextPlayers.get(player.id) ?? player;
    return {
      id: player.id,
      x: lerp(player.x, nextPlayer.x, alpha),
      y: lerp(player.y, nextPlayer.y, alpha),
      energy: lerp(player.energy, nextPlayer.energy, alpha),
      active: alpha < 0.5 ? player.active : nextPlayer.active,
    };
  });

  const samePeriod = previous.clock.period === next.clock.period;
  return {
    t: time,
    clock: samePeriod
      ? {
          period: previous.clock.period,
          periodElapsed: lerp(previous.clock.periodElapsed, next.clock.periodElapsed, alpha),
          regulationPeriodDuration: previous.clock.regulationPeriodDuration,
        }
      : alpha < 0.5
        ? previous.clock
        : next.clock,
    ball: {
      x: lerp(previous.ball.x, next.ball.x, alpha),
      y: lerp(previous.ball.y, next.ball.y, alpha),
      ownerId: alpha < 0.5 ? previous.ball.ownerId : next.ball.ownerId,
      dead: alpha < 0.5 ? previous.ball.dead : next.ball.dead,
    },
    players,
  };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: ReplayFrame,
  metadata: Map<string, ReplayPlayerMeta>,
  homeColor: string,
  awayColor: string,
) {
  const width = canvas.width;
  const height = canvas.height;
  const padding = 42;
  const pitchX = padding;
  const pitchY = padding;
  const pitchW = width - padding * 2;
  const pitchH = height - padding * 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#176b3c";
  ctx.fillRect(0, 0, width, height);

  const stripeCount = 12;
  for (let i = 0; i < stripeCount; i += 1) {
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.026)";
      ctx.fillRect(
        pitchX,
        pitchY + (pitchH / stripeCount) * i,
        pitchW,
        pitchH / stripeCount,
      );
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 3;
  ctx.strokeRect(pitchX, pitchY, pitchW, pitchH);
  line(ctx, pitchX, pitchY + pitchH / 2, pitchX + pitchW, pitchY + pitchH / 2);

  ctx.beginPath();
  ctx.arc(
    pitchX + pitchW / 2,
    pitchY + pitchH / 2,
    pitchW * 0.15,
    0,
    Math.PI * 2,
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(pitchX + pitchW / 2, pitchY + pitchH / 2, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();

  drawPenaltyArea(ctx, pitchX, pitchY, pitchW, pitchH, false);
  drawPenaltyArea(ctx, pitchX, pitchY, pitchW, pitchH, true);

  ctx.strokeRect(pitchX + pitchW * 0.42, pitchY - 14, pitchW * 0.16, 14);
  ctx.strokeRect(
    pitchX + pitchW * 0.42,
    pitchY + pitchH,
    pitchW * 0.16,
    14,
  );

  for (const player of frame.players) {
    if (!player.active) continue;
    const meta = metadata.get(player.id);
    if (!meta) continue;

    const screen = worldToScreen({ x: player.x, y: player.y }, pitchX, pitchY, pitchW, pitchH);
    const radius = 13;
    const playerColor = meta.team === "HOME" ? homeColor : awayColor;

    const isGoalkeeper = meta.position === "GK";

    if (isGoalkeeper) {
      // Le gardien garde la couleur de son équipe, mais adopte une silhouette
      // en losange et une double bordure dorée pour être identifiable
      // instantanément au milieu des joueurs de champ.
      ctx.save();
      ctx.translate(screen.x, screen.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = playerColor;
      ctx.fillRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#facc15";
      ctx.strokeRect(-radius * 0.78, -radius * 0.78, radius * 1.56, radius * 1.56);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius + 4, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.88)";
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = playerColor;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.stroke();
    }

    ctx.fillStyle = contrastText(playerColor);
    ctx.font = isGoalkeeper ? "900 9px sans-serif" : "800 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(isGoalkeeper ? "GK" : String(meta.shirtNumber), screen.x, screen.y);

    ctx.font = "600 10px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 3;
    ctx.fillText(shortLabel(meta.shortName), screen.x, screen.y + 16);
    ctx.shadowBlur = 0;

    const energyWidth = 30;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(screen.x - energyWidth / 2, screen.y - 22, energyWidth, 3);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(
      screen.x - energyWidth / 2,
      screen.y - 22,
      energyWidth * Math.max(0, Math.min(1, player.energy / 100)),
      3,
    );
  }

  const ball = worldToScreen(frame.ball, pitchX, pitchY, pitchW, pitchH);
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111820";
  ctx.stroke();
}

function worldToScreen(
  position: Pick<Vec2, "x" | "y">,
  pitchX: number,
  pitchY: number,
  pitchW: number,
  pitchH: number,
) {
  // Dans le moteur HOME attaque vers +x. À l'écran on pivote le terrain :
  // HOME apparaît en bas (x≈0) et attaque vers le haut (x≈1).
  return {
    x: pitchX + position.y * pitchW,
    y: pitchY + (1 - position.x) * pitchH,
  };
}

function drawPenaltyArea(
  ctx: CanvasRenderingContext2D,
  pitchX: number,
  pitchY: number,
  pitchW: number,
  pitchH: number,
  bottom: boolean,
) {
  const areaW = pitchW * 0.48;
  const areaH = pitchH * 0.16;
  const x = pitchX + (pitchW - areaW) / 2;
  const y = bottom ? pitchY + pitchH - areaH : pitchY;
  ctx.strokeRect(x, y, areaW, areaH);

  const smallW = pitchW * 0.24;
  const smallH = pitchH * 0.065;
  const smallX = pitchX + (pitchW - smallW) / 2;
  const smallY = bottom ? pitchY + pitchH - smallH : pitchY;
  ctx.strokeRect(smallX, smallY, smallW, smallH);
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function shortLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

function contrastText(hex: string): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return "#ffffff";
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}

function formatMatchClock(frame: ReplayFrame): string {
  const { period, periodElapsed, regulationPeriodDuration } = frame.clock;
  const baseMinute = period === 1 ? 0 : 45;
  if (periodElapsed <= regulationPeriodDuration) {
    const seconds =
      baseMinute * 60 +
      (periodElapsed / regulationPeriodDuration) * 45 * 60;
    const minute = Math.floor(seconds / 60);
    const second = Math.floor(seconds % 60);
    return `${minute}:${String(second).padStart(2, "0")}`;
  }
  const addedSeconds =
    ((periodElapsed - regulationPeriodDuration) / regulationPeriodDuration) *
    45 *
    60;
  return `${period === 1 ? 45 : 90}+${Math.floor(addedSeconds / 60) + 1}`;
}

function overlayDurationForEvent(event: MatchEvent): number {
  switch (event.type) {
    case "GOAL": return 2600;
    case "PENALTY": return 1700;
    case "HALF_TIME": return 1800;
    case "CORNER":
    case "FREE_KICK": return 1450;
    case "INJURY": return 1700;
    case "RED_CARD": return 1600;
    case "YELLOW_CARD": return 1100;
    case "SUBSTITUTION": return 1300;
    case "THROW_IN":
    case "GOAL_KICK":
    case "OFFSIDE": return 1050;
    case "ADDED_TIME": return 1000;
    default: return 0;
  }
}

function freezeDurationForEvent(event: MatchEvent): number {
  switch (event.type) {
    // Les coups de pied arrêtés ont déjà leur arrêt de jeu dans le replay.
    // Leur bandeau reste visible sans figer le ballon au moment de la remise.
    case "GOAL": return 2100;
    case "HALF_TIME": return 1500;
    case "INJURY": return 1100;
    case "RED_CARD": return 900;
    case "YELLOW_CARD": return 600;
    case "SUBSTITUTION": return 750;
    default: return 0;
  }
}

function eventDisplayTime(event: MatchEvent, logicalDuration: number): number {
  const delay = (() => {
    switch (event.type) {
      // Le but est affiché APRES le franchissement visuel de la ligne.
      case "GOAL": return 0.12;
      // Les arrêts de jeu ordinaires sont annoncés au milieu du
      // repositionnement, pas avant que l'action précédente soit visible.
      case "PENALTY": return 1.55;
      case "CORNER": return 1.05;
      case "FREE_KICK": return 1.10;
      case "THROW_IN": return 0.62;
      case "GOAL_KICK": return 0.85;
      case "OFFSIDE": return 0.80;
      default: return 0.08;
    }
  })();
  return Math.min(logicalDuration, event.t + delay);
}

function eventTitle(event: MatchEvent): string {
  switch (event.type) {
    case "GOAL": return "BUT !";
    case "PENALTY": return "PENALTY";
    case "CORNER": return "CORNER";
    case "FREE_KICK": return "COUP FRANC";
    case "THROW_IN": return "TOUCHE";
    case "GOAL_KICK": return "SIX MÈTRES";
    case "OFFSIDE": return "HORS-JEU";
    case "SUBSTITUTION": return "CHANGEMENT";
    case "INJURY": return "BLESSURE";
    case "RED_CARD": return "CARTON ROUGE";
    case "YELLOW_CARD": return "CARTON JAUNE";
    case "HALF_TIME": return "MI-TEMPS";
    case "ADDED_TIME": return "TEMPS ADDITIONNEL";
    default: return event.type.replaceAll("_", " ");
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
