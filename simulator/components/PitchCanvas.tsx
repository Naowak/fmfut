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
  const goalPauseUntilRef = useRef(0);
  const handledGoalsRef = useRef(new Set<string>());

  const [time, setTime] = useState(0);
  const [goalCelebration, setGoalCelebration] = useState<MatchEvent | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  const metadata = useMemo(
    () => new Map(replay.players.map((player) => [player.runtimeId, player])),
    [replay.players],
  );

  useEffect(() => {
    setTime(0);
    setPlaying(true);
    setGoalCelebration(null);
    goalPauseUntilRef.current = 0;
    handledGoalsRef.current.clear();
    lastTimestampRef.current = null;
  }, [replay]);

  useEffect(() => {
    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const deltaSeconds = (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      if (goalPauseUntilRef.current > 0) {
        if (timestamp < goalPauseUntilRef.current) {
          animationRef.current = requestAnimationFrame(tick);
          return;
        }
        goalPauseUntilRef.current = 0;
        setGoalCelebration(null);
      }

      if (playing) {
        setTime((previous) => {
          const next = Math.min(
            replay.logicalDuration,
            previous + deltaSeconds * speed,
          );

          const crossedGoal = replay.events.find((event) => {
            if (event.type !== "GOAL") return false;
            const key = `${event.t}-${event.runtimeId ?? event.playerId ?? "goal"}`;
            return (
              event.t > previous + 1e-6 &&
              event.t <= next + 1e-6 &&
              !handledGoalsRef.current.has(key)
            );
          });

          if (crossedGoal) {
            const key = `${crossedGoal.t}-${crossedGoal.runtimeId ?? crossedGoal.playerId ?? "goal"}`;
            handledGoalsRef.current.add(key);
            setGoalCelebration(crossedGoal);
            goalPauseUntilRef.current = timestamp + 2600;
            return crossedGoal.t;
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

  const displayedMinute = Math.min(
    replay.displayedMinutes,
    (time / replay.logicalDuration) * replay.displayedMinutes,
  );

  return (
    <div className="match-view-grid">
      <div className="pitch-column">
        <div
          className="match-scoreboard"
          style={{ maxWidth: `${pitchMaxWidth}px` }}
        >
          <span className="score-team">{replay.homeName}</span>
          <span className="score-value">
            {liveScore.home} - {liveScore.away}
          </span>
          <span className="score-team">{replay.awayName}</span>
          <span className="scoreboard-clock">{formatDisplayedMinute(displayedMinute)}</span>
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

          {goalCelebration && (
            <div
              className="goal-celebration"
              style={{
                borderColor: goalCelebration.team === "HOME" ? homeColor : awayColor,
              }}
            >
              <strong>BUT !</strong>
              <span>{goalCelebration.message}</span>
            </div>
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

        <div className="replay-controls">
          <button
            type="button"
            className="control-button"
            onClick={() => {
              if (time >= replay.logicalDuration) {
                setTime(0);
                setPlaying(true);
                setGoalCelebration(null);
                goalPauseUntilRef.current = 0;
                handledGoalsRef.current.clear();
                return;
              }
              setPlaying((value) => !value);
            }}
          >
            {playing
              ? "Pause"
              : time >= replay.logicalDuration
                ? "Rejouer"
                : "Lecture"}
          </button>

          <div className="speed-buttons">
            {([1, 2, 4] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="control-button"
                data-active={speed === value}
                onClick={() => setSpeed(value)}
              >
                ×{value}
              </button>
            ))}
          </div>

          <input
            type="range"
            min={0}
            max={replay.logicalDuration}
            step={0.1}
            value={time}
            onChange={(event) => {
              setTime(Number(event.target.value));
              setPlaying(false);
              setGoalCelebration(null);
              goalPauseUntilRef.current = 0;
            }}
            aria-label="Position dans le replay"
          />

          <span className="muted">
            {Math.round(time)}s / {replay.logicalDuration}s
          </span>
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
            {Math.floor(displayedMinute)}&apos;
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
                logicalDuration={replay.logicalDuration}
                displayedMinutes={replay.displayedMinutes}
              />
            ))
          )}
        </div>
      </aside>
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
  logicalDuration,
  displayedMinutes,
}: {
  event: MatchEvent;
  logicalDuration: number;
  displayedMinutes: number;
}) {
  const minute = Math.floor((event.t / logicalDuration) * displayedMinutes);

  return (
    <div className="event-item">
      <span className="event-minute">{minute}&apos;</span>
      {event.message}
    </div>
  );
}

function isInterestingEvent(event: MatchEvent): boolean {
  return [
    "GOAL",
    "SHOT",
    "SAVE",
    "MISS",
    "OFFSIDE",
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

  return {
    t: time,
    ball: {
      x: lerp(previous.ball.x, next.ball.x, alpha),
      y: lerp(previous.ball.y, next.ball.y, alpha),
      ownerId: alpha < 0.5 ? previous.ball.ownerId : next.ball.ownerId,
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

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = playerColor;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.stroke();

    ctx.fillStyle = contrastText(playerColor);
    ctx.font = "800 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(meta.shirtNumber), screen.x, screen.y);

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

function formatDisplayedMinute(minute: number): string {
  const whole = Math.floor(minute);
  const seconds = Math.floor((minute - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
