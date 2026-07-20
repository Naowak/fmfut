"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MatchEvent,
  MatchReplay,
  ReplayFrame,
  ReplayPlayerFrame,
  ReplayPlayerMeta,
} from "@/lib/game/types";

type Props = {
  replay: MatchReplay;
};

type InterpolatedPlayer = ReplayPlayerFrame;

export function PitchCanvas({ replay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number | null>(null);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);

  const metadata = useMemo(
    () => new Map(replay.players.map((player) => [player.runtimeId, player])),
    [replay.players],
  );

  useEffect(() => {
    setTime(0);
    setPlaying(true);
    lastTimestampRef.current = null;
  }, [replay]);

  useEffect(() => {
    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp;
      }

      const deltaSeconds =
        (timestamp - lastTimestampRef.current) / 1000;
      lastTimestampRef.current = timestamp;

      if (playing) {
        setTime((previous) => {
          const next = previous + deltaSeconds * speed;
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
  }, [playing, replay.logicalDuration, speed]);

  const snapshot = useMemo(
    () => interpolateReplay(replay.frames, time),
    [replay.frames, time],
  );

  const liveScore = useMemo(() => {
    let home = 0;
    let away = 0;
    for (const event of replay.events) {
      if (event.t > time) {
        break;
      }
      if (event.type === "GOAL") {
        if (event.team === "HOME") home += 1;
        if (event.team === "AWAY") away += 1;
      }
    }
    return { home, away };
  }, [replay.events, time]);

  const recentEvents = useMemo(
    () =>
      replay.events
        .filter((event) => event.t <= time)
        .filter(isInterestingEvent)
        .slice(-6)
        .reverse(),
    [replay.events, time],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    drawScene(ctx, canvas, snapshot, metadata);
  }, [metadata, snapshot]);

  const displayedMinute = Math.min(
    replay.displayedMinutes,
    (time / replay.logicalDuration) * replay.displayedMinutes,
  );

  return (
    <>
      <div className="pitch-wrap">
        <div className="pitch-stage">
          <canvas
            ref={canvasRef}
            width={1200}
            height={750}
            className="pitch-canvas"
          />

          <div className="score-overlay">
            <span className="score-team">{replay.homeName}</span>
            <span className="score-value">
              {liveScore.home} - {liveScore.away}
            </span>
            <span className="score-team">{replay.awayName}</span>
          </div>

          <div className="clock">
            {formatDisplayedMinute(displayedMinute)}
          </div>
        </div>

        <div className="replay-controls">
          <button
            type="button"
            className="control-button"
            onClick={() => {
              if (time >= replay.logicalDuration) {
                setTime(0);
                setPlaying(true);
                return;
              }
              setPlaying((value) => !value);
            }}
          >
            {playing ? "Pause" : time >= replay.logicalDuration ? "Rejouer" : "Lecture"}
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
            }}
            aria-label="Position dans le replay"
          />

          <span className="muted">
            {Math.round(time)}s / {replay.logicalDuration}s
          </span>
        </div>
      </div>

      <div className="result-banner">
        <span>
          90 minutes affichées = {replay.logicalDuration}s logiques.
        </span>
        <span>Seed : {replay.seed}</span>
      </div>

      {recentEvents.length > 0 && (
        <div style={{ padding: "0 14px 14px" }}>
          <div className="event-list">
            {recentEvents.map((event, index) => (
              <EventLine
                key={`${event.t}-${event.type}-${index}`}
                event={event}
                logicalDuration={replay.logicalDuration}
                displayedMinutes={replay.displayedMinutes}
              />
            ))}
          </div>
        </div>
      )}
    </>
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
  const minute = Math.floor(
    (event.t / logicalDuration) * displayedMinutes,
  );

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
    "YELLOW_CARD",
    "RED_CARD",
    "INJURY",
    "SUBSTITUTION",
    "HALF_TIME",
    "FULL_TIME",
  ].includes(event.type);
}

function interpolateReplay(
  frames: ReplayFrame[],
  time: number,
): ReplayFrame | null {
  if (frames.length === 0) {
    return null;
  }

  if (time <= frames[0].t) {
    return frames[0];
  }

  if (time >= frames[frames.length - 1].t) {
    return frames[frames.length - 1];
  }

  let low = 0;
  let high = frames.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (frames[mid].t < time) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const next = frames[low];
  const previous = frames[Math.max(0, low - 1)];
  const duration = Math.max(0.0001, next.t - previous.t);
  const alpha = (time - previous.t) / duration;

  const nextPlayers = new Map(
    next.players.map((player) => [player.id, player]),
  );

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
      ownerId:
        alpha < 0.5
          ? previous.ball.ownerId
          : next.ball.ownerId,
    },
    players,
  };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: ReplayFrame,
  metadata: Map<string, ReplayPlayerMeta>,
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

  const stripeCount = 10;
  for (let i = 0; i < stripeCount; i += 1) {
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(
        pitchX + (pitchW / stripeCount) * i,
        pitchY,
        pitchW / stripeCount,
        pitchH,
      );
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 3;

  ctx.strokeRect(pitchX, pitchY, pitchW, pitchH);
  line(ctx, pitchX + pitchW / 2, pitchY, pitchX + pitchW / 2, pitchY + pitchH);

  ctx.beginPath();
  ctx.arc(
    pitchX + pitchW / 2,
    pitchY + pitchH / 2,
    pitchH * 0.12,
    0,
    Math.PI * 2,
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    pitchX + pitchW / 2,
    pitchY + pitchH / 2,
    4,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fill();

  drawPenaltyArea(ctx, pitchX, pitchY, pitchW, pitchH, false);
  drawPenaltyArea(ctx, pitchX, pitchY, pitchW, pitchH, true);

  ctx.strokeRect(
    pitchX - 14,
    pitchY + pitchH * 0.42,
    14,
    pitchH * 0.16,
  );
  ctx.strokeRect(
    pitchX + pitchW,
    pitchY + pitchH * 0.42,
    14,
    pitchH * 0.16,
  );

  for (const player of frame.players) {
    if (!player.active) {
      continue;
    }

    const meta = metadata.get(player.id);
    if (!meta) {
      continue;
    }

    const x = pitchX + player.x * pitchW;
    const y = pitchY + player.y * pitchH;
    const radius = 13;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle =
      meta.team === "HOME" ? "#f3f5f7" : "#151b23";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle =
      meta.team === "HOME" ? "#18212a" : "#f3f5f7";
    ctx.stroke();

    ctx.fillStyle =
      meta.team === "HOME" ? "#10161d" : "#ffffff";
    ctx.font = "700 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(meta.shirtNumber), x, y);

    ctx.font = "600 10px sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(shortLabel(meta.shortName), x, y + 16);

    const energyWidth = 30;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - energyWidth / 2, y - 22, energyWidth, 3);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(
      x - energyWidth / 2,
      y - 22,
      energyWidth * Math.max(0, Math.min(1, player.energy / 100)),
      3,
    );
  }

  const ballX = pitchX + frame.ball.x * pitchW;
  const ballY = pitchY + frame.ball.y * pitchH;

  ctx.beginPath();
  ctx.arc(ballX, ballY, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#f8fafc";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111820";
  ctx.stroke();
}

function drawPenaltyArea(
  ctx: CanvasRenderingContext2D,
  pitchX: number,
  pitchY: number,
  pitchW: number,
  pitchH: number,
  right: boolean,
) {
  const areaW = pitchW * 0.16;
  const areaH = pitchH * 0.48;
  const y = pitchY + (pitchH - areaH) / 2;
  const x = right ? pitchX + pitchW - areaW : pitchX;
  ctx.strokeRect(x, y, areaW, areaH);

  const smallW = pitchW * 0.065;
  const smallH = pitchH * 0.24;
  const smallX = right ? pitchX + pitchW - smallW : pitchX;
  const smallY = pitchY + (pitchH - smallH) / 2;
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

function formatDisplayedMinute(minute: number): string {
  const whole = Math.floor(minute);
  const seconds = Math.floor((minute - whole) * 60);
  return `${String(whole).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
